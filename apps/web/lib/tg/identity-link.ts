import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "./admin";
import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/access";

export type IdentityToAttach =
  | { kind: "email"; email: string }
  | { kind: "telegram"; tgId: number; username?: string }
  | { kind: "google" }
  | { kind: "apple" };

export type AttachError =
  | "already_attached" // 本账号已绑过同类身份（TG：绑过别的 tgId；email：已有别的真实已验证邮箱）
  | "taken" // 目标身份被别的账号占用
  | "no_pending" // complete 阶段：nonce 不存在／已消费／已过期
  | "unverified" // complete 阶段：持票用户的邮箱未验证，不能作为所有权证明
  | "email_mismatch" // complete 阶段：持票邮箱与该 nonce 声明的邮箱不一致
  | "orphan_has_data" // complete 阶段：待释放的账号名下有数据，不是本流程新建的空壳
  | "send_failed"; // 底层 Supabase 调用失败

export type AttachResult = { ok: true } | { ok: false; error: AttachError };

/** 绑定意向的有效期。OTP 邮件到达是秒级的，15 分钟对真人操作足够宽裕。 */
const PENDING_TTL_MS = 15 * 60 * 1000;

type AdminClient = ReturnType<typeof supabaseAdmin>;

/**
 * admin.listUsers 默认每页 50 条——线上影子用户早已超过这个数，只看第一页的
 * 占用检查等于没查。这里翻页扫全量。
 *
 * ⚠️ 终止条件用响应里的 `nextPage`，不用「本页条数 < 请求的 perPage」：GoTrue
 * 对 per_page 有服务端上限，一旦它小于我们请求的值，每一页都会「短于请求量」，
 * 那种写法会在第一页就退出并返回「无人占用」——一个 fail-open 的占用检查，
 * 正是本函数存在的意义所在（评审 NEW-3）。
 */
async function findUserByEmail(
  sb: AdminClient,
  email: string,
): Promise<{ user: { id: string; email?: string } | null; error?: unknown }> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 500; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) return { user: null, error: error ?? new Error("listUsers failed") };
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return { user: hit };
    const next = (data as { nextPage?: number | null }).nextPage;
    if (!next) return { user: null };
  }
  // 500 页 × 200 = 10 万用户仍未扫完：宁可报错也不能返回「无人占用」。
  return { user: null, error: new Error("listUsers pagination exceeded") };
}

/** 真实（非合成域名）且已验证的邮箱——与 resolveAccess 的 hasVerifiedEmail 同一口径。 */
function isRealVerifiedEmail(email: string | null | undefined, confirmedAt: unknown): boolean {
  return !!email && !!confirmedAt && !email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}

/**
 * 绑定对称化（EP-account2-04）：任何有效会话都可以绑定本账号尚未拥有的身份类型。
 * telegram 是唯一必须自定义的分支（非 Supabase 原生 provider）；google/apple
 * 本轮只留接缝，真正调用时抛错。
 *
 * email 分支是两阶段流程的**第一阶段（prepare）**：只校验 + 发一个一次性 nonce，
 * 绝不提前把真实邮箱写到账号上——实测（2026-08-20 生产 GoTrue）
 * `updateUserById(uid,{email})` 不清 `email_confirmed_at`，显式 `email_confirm:false`
 * 同样不清。影子用户建号时该字段已被 `email_confirm:true` 填充，若先写邮箱再验证，
 * 账号会在「尚未验证」期间被 resolveAccess 判成 hasVerifiedEmail=true，付费门槛
 * 形同虚设。真正的邮箱写入发生在 completeEmailAttach、用户点击验证邮件之后。
 */
export async function attachIdentity(
  uid: string,
  identity: IdentityToAttach,
): Promise<AttachResult | { ok: true; nonce: string }> {
  const sb = supabaseAdmin();

  if (identity.kind === "email") {
    const email = identity.email.toLowerCase();

    const { data: selfRes, error: selfErr } = await sb.auth.admin.getUserById(uid);
    if (selfErr || !selfRes.user) return { ok: false, error: "send_failed" };
    const self = selfRes.user;
    const current = self.email?.toLowerCase() ?? null;

    // S3：本账号已有「别的」真实已验证邮箱 → 拒绝覆盖。影子邮箱、未验证旧邮箱、
    // 同邮箱重绑（幂等）放行。
    if (current && current !== email && isRealVerifiedEmail(self.email, self.email_confirmed_at)) {
      return { ok: false, error: "already_attached" };
    }

    if (current !== email) {
      const { user: owner, error } = await findUserByEmail(sb, email);
      if (error) return { ok: false, error: "send_failed" };
      if (owner && owner.id !== uid) return { ok: false, error: "taken" };
    }

    // 作废本账号此前未消费的意向：同一时刻只允许一条在途，避免用户连点两次后
    // 留下两个都能用的 nonce。
    await sb.from("email_bind_pending").delete().eq("user_id", uid).is("consumed_at", null);

    const nonce = randomBytes(32).toString("base64url");
    const { error: insErr } = await sb.from("email_bind_pending").insert({ user_id: uid, email, nonce });
    if (insErr) return { ok: false, error: "send_failed" };

    // nonce 回给客户端，由它拼进 signInWithOtp 的 emailRedirectTo。
    return { ok: true, nonce };
  }

  if (identity.kind === "telegram") {
    // S3 前置反查：本账号是否已绑过「别的」TG。不做这步的话，重复绑定会撞
    // tg_users.supabase_user_id 唯一索引，路由只能返 500——语义错误且难看。
    const { data: mine, error: mineErr } = await sb
      .from("tg_users")
      .select("tg_user_id")
      .eq("supabase_user_id", uid)
      .maybeSingle();
    // 查询失败必须拒绝，不能当作「没绑过」放行（评审 NEW-6：静默吞错等于绕过前置校验）。
    if (mineErr) return { ok: false, error: "send_failed" };
    if (mine && mine.tg_user_id !== identity.tgId) return { ok: false, error: "already_attached" };

    const { data: existing, error: exErr } = await sb
      .from("tg_users")
      .select("supabase_user_id")
      .eq("tg_user_id", identity.tgId)
      .maybeSingle();
    if (exErr) return { ok: false, error: "send_failed" };

    if (!existing) {
      const { error } = await sb.from("tg_users").insert({
        tg_user_id: identity.tgId,
        supabase_user_id: uid,
        username: identity.username ?? null,
      });
      if (error) return { ok: false, error: "send_failed" };
      return { ok: true };
    }

    if (existing.supabase_user_id === uid) return { ok: true }; // 已绑给自己：幂等

    return { ok: false, error: "already_attached" };
  }

  // google / apple：本轮只留接缝，不实装（spec §8）。
  throw new Error(`attachIdentity: provider "${identity.kind}" 未实装`);
}

/** complete 前给用户看的确认信息——「要把哪个邮箱绑到哪个账号」。 */
export type PendingBindPreview = { email: string; targetIsCurrentUser: boolean };

/**
 * 按 nonce 读取一条**未消费且未过期**的意向，供确认屏展示。只读，不消费。
 */
export async function peekEmailBind(
  nonce: string,
  bearerUserId: string | null,
): Promise<{ ok: true; preview: PendingBindPreview } | { ok: false; error: AttachError }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("email_bind_pending")
    .select("user_id, email, created_at, consumed_at")
    .eq("nonce", nonce)
    .maybeSingle();
  if (error) return { ok: false, error: "send_failed" };
  if (!data || data.consumed_at) return { ok: false, error: "no_pending" };
  if (Date.now() - new Date(data.created_at as string).getTime() > PENDING_TTL_MS) {
    return { ok: false, error: "no_pending" };
  }
  return {
    ok: true,
    preview: { email: data.email as string, targetIsCurrentUser: data.user_id === bearerUserId },
  };
}

/**
 * email 绑定的**第二阶段（complete）**：用户点击验证邮件、在确认屏上确认后调用。
 *
 * 安全模型：
 *   - 「谁拥有这个邮箱」由 GoTrue 证明——持票会话的 email_confirmed_at 已置位，
 *     说明这封信真的被收件人打开过。
 *   - 「绑到哪个账号」由 **nonce** 决定，不再按邮箱字符串全库反查。nonce 在
 *     prepare 时生成、只回给发起方、随邮件 URL 跨浏览器送达、单次消费、15 分钟
 *     过期。一次普通注册的链接里没有 nonce，因此走不进这条流程——旧设计里
 *     「预埋邮箱意向、等真正的所有者注册时吞掉对方账号」的攻击链从起点断掉。
 *
 * 释放邮箱用**改名而非删号**：auth.users.email 唯一，要把已验证邮箱挪到目标
 * 账号，必须先让原持有者让出该地址。改名是可逆的——若后续写入失败可原样改回；
 * 删号不可逆，一旦第二步失败用户的账号就没了（评审 NEW-2）。auth 路径里不该有
 * 不可逆的破坏性操作。
 */
export async function completeEmailAttach(opts: {
  nonce: string;
  /** 点链接换来的会话 access_token（孤儿或目标账号本人的）。 */
  bearerToken: string;
}): Promise<AttachResult> {
  const sb = supabaseAdmin();

  const { data: proofRes } = await sb.auth.getUser(opts.bearerToken);
  const proof = proofRes.user;
  if (!proof?.email || !proof.email_confirmed_at) return { ok: false, error: "unverified" };
  const email = proof.email.toLowerCase();

  // 意向：按 nonce 定位，必须未消费且未过期。
  const { data: pending, error: pendErr } = await sb
    .from("email_bind_pending")
    .select("id, user_id, email, created_at, consumed_at")
    .eq("nonce", opts.nonce)
    .maybeSingle();
  if (pendErr) return { ok: false, error: "send_failed" };
  if (!pending || pending.consumed_at) return { ok: false, error: "no_pending" };
  if (Date.now() - new Date(pending.created_at as string).getTime() > PENDING_TTL_MS) {
    return { ok: false, error: "no_pending" };
  }
  // 持票邮箱必须正是该 nonce 声明要绑的邮箱——否则拿一个自己的已验证邮箱 +
  // 别人的 nonce 就能把别人的意向兑换成自己的绑定。
  if ((pending.email as string).toLowerCase() !== email) return { ok: false, error: "email_mismatch" };

  const uid = pending.user_id as string;

  // 单次消费：先占坑再执行。条件更新（consumed_at is null）让并发两次点击只有
  // 一次能拿到活儿干。
  const { data: claimed, error: claimErr } = await sb
    .from("email_bind_pending")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", pending.id)
    .is("consumed_at", null)
    .select("id");
  if (claimErr) return { ok: false, error: "send_failed" };
  if (!claimed || claimed.length === 0) return { ok: false, error: "no_pending" };

  // 幂等：点链接换来的就是目标账号自己的会话（邮箱已在目标账号上）。
  if (proof.id === uid) return { ok: true };

  const { data: selfRes, error: selfErr } = await sb.auth.admin.getUserById(uid);
  if (selfErr || !selfRes.user) return { ok: false, error: "send_failed" };
  const self = selfRes.user;

  // 目标账号状态复查（prepare 之后状态可能变了）。
  if (
    self.email &&
    self.email.toLowerCase() !== email &&
    isRealVerifiedEmail(self.email, self.email_confirmed_at)
  ) {
    return { ok: false, error: "already_attached" };
  }

  // 持票账号必须是本流程产生的空壳，不能是一个有数据的真实账号。nonce 已经
  // 保证了「这次绑定是目标账号发起的」，这一条再保证「被让出地址的一方没有
  // 东西可丢」——两条都成立才动它。
  const [{ count: profileCount }, { count: msgCount }] = await Promise.all([
    sb.from("profiles").select("id", { count: "exact", head: true }).eq("user_id", proof.id),
    sb.from("spirit_messages").select("id", { count: "exact", head: true }).eq("user_id", proof.id),
  ]);
  if ((profileCount ?? 0) > 0 || (msgCount ?? 0) > 0) return { ok: false, error: "orphan_has_data" };

  // 释放地址：把持票账号的邮箱改成一个作废的合成地址（可逆），不是删号。
  const releasedEmail = `released_${proof.id}@${SYNTHETIC_EMAIL_DOMAIN}`;
  const { error: relErr } = await sb.auth.admin.updateUserById(proof.id, { email: releasedEmail });
  if (relErr) return { ok: false, error: "send_failed" };

  // 写入目标账号。email_confirm: true 是诚实的——所有权刚由这封信的点击证明。
  const { error: bindErr } = await sb.auth.admin.updateUserById(uid, {
    email: proof.email,
    email_confirm: true,
  });
  if (bindErr) {
    // 补偿：把地址还回去，让系统回到 complete 之前的状态。补偿本身失败也不再
    // 抛——此时目标账号未变、持票账号顶着一个作废地址，是可人工恢复的状态，
    // 比把异常抛给用户更有用的是让调用方看到明确的失败码。
    const { error: revertErr } = await sb.auth.admin.updateUserById(proof.id, { email: proof.email });
    if (revertErr) console.error("completeEmailAttach: 释放地址后回滚失败", { proofId: proof.id, revertErr });
    return { ok: false, error: "send_failed" };
  }

  return { ok: true };
}
