import { supabaseAdmin } from "./admin";

export type IdentityToAttach =
  | { kind: "email"; email: string }
  | { kind: "telegram"; tgId: number; username?: string }
  | { kind: "google" }
  | { kind: "apple" };

export type AttachResult = { ok: true } | { ok: false; error: "already_attached" | "taken" | "send_failed" };

/**
 * 绑定对称化（EP-account2-04）。此前 link-email/link-telegram 两条路由各带各的
 * 鉴权前提（"绑你没用来登录的那个"），把系统锁死在双身份世界——接 Google/Apple
 * 时会演化成 link-google/link-apple 四条各自为政的路由。
 *
 * 新规则：任何有效会话都可以绑定本账号尚未拥有的身份类型。email/google/apple
 * 委托 Supabase 原生身份系统；telegram 是唯一必须自定义的分支（非 Supabase
 * 原生 provider）。google/apple 本轮只留接缝，真正调用时抛错——不是悄悄什么都
 * 不做，是明确告诉调用方"这条还没接"（spec §8：本轮不接 OAuth 实装）。
 */
export async function attachIdentity(uid: string, identity: IdentityToAttach): Promise<AttachResult> {
  const sb = supabaseAdmin();

  if (identity.kind === "email") {
    const { data: list } = await sb.auth.admin.listUsers();
    const taken = list.users.some(
      (u) => u.email?.toLowerCase() === identity.email.toLowerCase() && u.id !== uid,
    );
    if (taken) return { ok: false, error: "taken" };

    const { error: updateError } = await sb.auth.admin.updateUserById(uid, { email: identity.email });
    if (updateError) return { ok: false, error: "send_failed" };

    const { error: linkError } = await sb.auth.admin.generateLink({ type: "magiclink", email: identity.email });
    if (linkError) return { ok: false, error: "send_failed" };

    return { ok: true };
  }

  if (identity.kind === "telegram") {
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
