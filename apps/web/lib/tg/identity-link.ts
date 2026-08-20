import { supabaseAdmin } from "./admin";
import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/access";

export type IdentityToAttach =
  | { kind: "email"; email: string }
  | { kind: "telegram"; tgId: number; username?: string }
  | { kind: "google" }
  | { kind: "apple" };

export type AttachError =
  | "already_attached" // 本账号已绑过同类身份（TG：绑过别的 tgId；email：已有别的真实已验证邮箱）
  | "taken" // 目标身份被别的账号占用（complete 阶段也用于「邮箱属于一个老账号」的守卫拒绝）
  | "no_pending" // complete 阶段：目标账号没有与该邮箱匹配的待绑定意向
  | "unverified" // complete 阶段：持票用户的邮箱未验证，不能作为所有权证明
  | "send_failed"; // 底层 Supabase 调用失败

export type AttachResult = { ok: true } | { ok: false; error: AttachError };

/**
 * user_metadata 里的待绑定意向键。prepare 阶段写入，complete 阶段校验并清除。
 * 它是跨浏览器完成绑定的唯一安全凭据：邮件链接可能在另一台设备/浏览器被点开
 * （TG WebView 里发的信，系统在邮箱 App 里打开——没有 zj_tg cookie），
 * 此时靠「哪个账号声明过要绑这个邮箱」来定位目标账号。
 */
const PENDING_EMAIL_KEY = "pending_email";
const PENDING_EMAIL_AT_KEY = "pending_email_at";

/** complete 阶段「孤儿用户」的新鲜度窗口：OTP 验证即创建，点击后秒级到达，15 分钟足够宽裕。 */
const ORPHAN_FRESH_MS = 15 * 60 * 1000;

type AdminClient = ReturnType<typeof supabaseAdmin>;

/**
 * admin.listUsers 默认每页 50 条——线上影子用户早已超过这个数，只看第一页的
 * 占用检查等于没查（EP-account2 评审 S3 同源问题）。这里翻页扫全量。
 */
async function findUserByEmail(
  sb: AdminClient,
  email: string,
): Promise<{ user: { id: string; email?: string } | null; error?: unknown }> {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
    if (error || !data) return { user: null, error: error ?? new Error("listUsers failed") };
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return { user: hit };
    if (data.users.length < perPage) return { user: null };
  }
}

function withoutPending(meta: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...meta };
  delete rest[PENDING_EMAIL_KEY];
  delete rest[PENDING_EMAIL_AT_KEY];
  return rest;
}

/** 真实（非合成域名）且已验证的邮箱——与 resolveAccess 的 hasVerifiedEmail 同一口径。 */
function isRealVerifiedEmail(email: string | null | undefined, confirmedAt: unknown): boolean {
  return !!email && !!confirmedAt && !email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}

/**
 * 绑定对称化（EP-account2-04）。此前 link-email/link-telegram 两条路由各带各的
 * 鉴权前提（"绑你没用来登录的那个"），把系统锁死在双身份世界——接 Google/Apple
 * 时会演化成 link-google/link-apple 四条各自为政的路由。
 *
 * 新规则：任何有效会话都可以绑定本账号尚未拥有的身份类型。email/google/apple
 * 委托 Supabase 原生身份系统；telegram 是唯一必须自定义的分支（非 Supabase
 * 原生 provider）。google/apple 本轮只留接缝，真正调用时抛错——不是悄悄什么都
 * 不做，是明确告诉调用方"这条还没接"（spec §8：本轮不接 OAuth 实装）。
 *
 * email 分支是两阶段流程的第一阶段（prepare），本函数只做校验 + 记录意向，
 * 绝不提前把真实邮箱写到账号上——实测（2026-08-20，生产 GoTrue，原始输出见
 * task-8-report.md）：updateUserById(uid,{email}) 不清 email_confirmed_at，
 * 显式 email_confirm:false 也不清。影子用户建号时 email_confirm:true 已填充该
 * 字段，若先写邮箱再验证，账号会在「未验证」期间被 resolveAccess 误判为
 * hasVerifiedEmail=true，付费门槛形同虚设（阻断 1）。真正的邮箱写入发生在
 * completeEmailAttach 里、用户点击验证邮件之后。
 */
export async function attachIdentity(uid: string, identity: IdentityToAttach): Promise<AttachResult> {
  const sb = supabaseAdmin();

  if (identity.kind === "email") {
    const email = identity.email.toLowerCase();

    const { data: selfRes, error: selfErr } = await sb.auth.admin.getUserById(uid);
    if (selfErr || !selfRes.user) return { ok: false, error: "send_failed" };
    const self = selfRes.user;
    const current = self.email?.toLowerCase() ?? null;

    // S3：本账号已有「别的」真实已验证邮箱 → 拒绝覆盖（旧的静默替换会把这个
    // 已验证身份神不知鬼不觉换掉）。影子邮箱、未验证旧邮箱、同邮箱重绑（幂等）放行。
    if (current && current !== email && isRealVerifiedEmail(self.email, self.email_confirmed_at)) {
      return { ok: false, error: "already_attached" };
    }

    if (current !== email) {
      const { user: owner, error } = await findUserByEmail(sb, email);
      if (error) return { ok: false, error: "send_failed" };
      if (owner && owner.id !== uid) return { ok: false, error: "taken" };
    }

    // 只记录意向，不动 email 字段。随后由客户端走既有 signInWithOtp 流程
    // （Supabase SMTP 真发信），用户点链接后 completeEmailAttach 完成绑定。
    const { error: metaErr } = await sb.auth.admin.updateUserById(uid, {
      user_metadata: {
        ...((self.user_metadata as Record<string, unknown> | null) ?? {}),
        [PENDING_EMAIL_KEY]: email,
        [PENDING_EMAIL_AT_KEY]: new Date().toISOString(),
      },
    });
    if (metaErr) return { ok: false, error: "send_failed" };

    return { ok: true };
  }

  if (identity.kind === "telegram") {
    // S3 前置反查：本账号是否已绑过「别的」TG。不做这步的话，重复绑定会撞
    // tg_users.supabase_user_id 唯一索引，路由只能返 500——语义错误且难看。
    const { data: mine } = await sb
      .from("tg_users")
      .select("tg_user_id")
      .eq("supabase_user_id", uid)
      .maybeSingle();
    if (mine && mine.tg_user_id !== identity.tgId) return { ok: false, error: "already_attached" };

    const { data: existing } = await sb
      .from("tg_users")
      .select("supabase_user_id")
      .eq("tg_user_id", identity.tgId)
      .maybeSingle();

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

/**
 * email 绑定的第二阶段（complete）：用户点击验证邮件里的魔法链接后，由
 * /auth/callback 携带「点链接换来的会话 token」调用。
 *
 * 安全模型：signInWithOtp 发出的链接被点击 = 邮箱所有权已被 GoTrue 证明
 * （实测：消费 magiclink 会把 email_confirmed_at 置位）。点击时若该邮箱尚无
 * 账号，GoTrue 会新建一个「孤儿用户」——complete 的工作就是把这个已验证邮箱
 * 从孤儿身上转移到声明过意向的目标账号上，然后删掉孤儿。
 *
 * 删用户是破坏性操作，三重守卫缺一不可：
 *   1. 目标账号的 pending_email 必须与孤儿邮箱精确匹配（意向声明）；
 *   2. 孤儿必须是 OTP 验证当场新建的新鲜用户（created_at 在窗口内）——
 *      老账号说明邮箱早有主，拒绝（taken），绝不动它；
 *   3. 占用复查：除目标与孤儿外不得有第三个账号持有该邮箱。
 */
export async function completeEmailAttach(opts: {
  /** TG 会话 cookie 解析出的 uid；跨浏览器点击时没有 cookie，传 null 走意向反查。 */
  tgUid: string | null;
  /** 点链接换来的会话 access_token（孤儿或目标账号本人的）。 */
  bearerToken: string;
}): Promise<AttachResult> {
  const sb = supabaseAdmin();

  const { data: proofRes } = await sb.auth.getUser(opts.bearerToken);
  const proof = proofRes.user;
  if (!proof?.email || !proof.email_confirmed_at) return { ok: false, error: "unverified" };
  const email = proof.email.toLowerCase();

  // 定位目标账号：TG cookie 优先；否则按 pending_email 意向反查（跨浏览器场景）。
  let uid = opts.tgUid;
  if (!uid) {
    const perPage = 200;
    for (let page = 1; ; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
      if (error || !data) return { ok: false, error: "send_failed" };
      const hit = data.users.find(
        (u) =>
          u.id !== proof.id &&
          (u.user_metadata as Record<string, unknown> | null)?.[PENDING_EMAIL_KEY] === email,
      );
      if (hit) {
        uid = hit.id;
        break;
      }
      if (data.users.length < perPage) return { ok: false, error: "no_pending" };
    }
  }

  const { data: selfRes, error: selfErr } = await sb.auth.admin.getUserById(uid);
  if (selfErr || !selfRes.user) return { ok: false, error: "send_failed" };
  const self = selfRes.user;
  const meta = (self.user_metadata as Record<string, unknown> | null) ?? {};

  // 守卫 1：意向必须匹配。
  if (meta[PENDING_EMAIL_KEY] !== email) return { ok: false, error: "no_pending" };

  // 幂等：点链接换来的就是目标账号自己的会话（邮箱已在目标账号上）——清意向即可。
  if (proof.id === uid) {
    const { error } = await sb.auth.admin.updateUserById(uid, { user_metadata: withoutPending(meta) });
    if (error) return { ok: false, error: "send_failed" };
    return { ok: true };
  }

  // 守卫 2：孤儿必须新鲜（OTP 验证即创建）。老账号 = 邮箱早有主，拒绝且绝不动它。
  const fresh = Date.now() - new Date(proof.created_at).getTime() < ORPHAN_FRESH_MS;
  if (!fresh) return { ok: false, error: "taken" };

  // 守卫 3：占用复查。
  const { user: owner, error: findErr } = await findUserByEmail(sb, email);
  if (findErr) return { ok: false, error: "send_failed" };
  if (owner && owner.id !== uid && owner.id !== proof.id) return { ok: false, error: "taken" };

  // 目标账号状态复查（prepare 之后状态可能变了）。
  if (
    self.email &&
    self.email.toLowerCase() !== email &&
    isRealVerifiedEmail(self.email, self.email_confirmed_at)
  ) {
    return { ok: false, error: "already_attached" };
  }

  // 执行：先删孤儿释放邮箱（唯一约束），再绑定。email_confirm: true 是显式且
  // 诚实的——所有权刚由 OTP 消费证明（实测：magiclink 消费会置位 confirmed_at）。
  const { error: delErr } = await sb.auth.admin.deleteUser(proof.id);
  if (delErr) return { ok: false, error: "send_failed" };

  const { error: bindErr } = await sb.auth.admin.updateUserById(uid, {
    email: proof.email,
    email_confirm: true,
    user_metadata: withoutPending(meta),
  });
  if (bindErr) return { ok: false, error: "send_failed" };

  return { ok: true };
}
