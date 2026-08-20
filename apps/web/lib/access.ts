import { supabaseAdmin } from "@/lib/tg/admin";
import { getEntitlement, isMember } from "@/lib/entitlements";

/**
 * TG 影子用户创建时用的合成邮箱域名（见 lib/tg/identity.ts 的 resolveOrCreateTgUser）。
 * 单一事实源——这个域名此前在 identity.ts 和 api/account/identities/route.ts 里
 * 各硬编码一份，任何一处漏改都会让「已验证邮箱」这个信号重新被污染。
 */
export const SYNTHETIC_EMAIL_DOMAIN = "zhaojian.local";

export type AccessLevel = "anonymous" | "identified" | "member";

export type AccessInfo = {
  level: AccessLevel;
  /** 真实、已验证、非合成域名的邮箱——不认 email_confirmed_at 的表面值。 */
  hasVerifiedEmail: boolean;
  hasTelegram: boolean;
};

/**
 * 全站唯一访问层级事实源（EP-account2-01）。替代散落各处的
 * isTelegram()/hasTgSession()/裸 uid 判断。三层语义见 spec §3：
 *   anonymous  — 无 TG 映射且无真实已验证邮箱：只能排盘/看确定性内容
 *   identified — 有 TG 映射或有真实已验证邮箱：可用 LLM 解读，计入免费额度
 *   member     — identified + 有效订阅 + hasVerifiedEmail：会员权益
 * 纯读取，无副作用——身份建立时的条款记录（consent）是独立的调用点，不在这里做。
 */
export async function resolveAccess(uid: string): Promise<AccessInfo> {
  const sb = supabaseAdmin();

  const [{ data: userRes }, { data: tgRow }] = await Promise.all([
    sb.auth.admin.getUserById(uid),
    sb.from("tg_users").select("supabase_user_id").eq("supabase_user_id", uid).maybeSingle(),
  ]);

  const email = userRes.user?.email ?? null;
  const emailConfirmed = !!userRes.user?.email_confirmed_at;
  const isSynthetic = !!email && email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
  const hasVerifiedEmail = emailConfirmed && !!email && !isSynthetic;
  const hasTelegram = !!tgRow;

  const identified = hasTelegram || hasVerifiedEmail;
  let level: AccessLevel = identified ? "identified" : "anonymous";
  if (identified && hasVerifiedEmail) {
    const ent = await getEntitlement(uid);
    if (isMember(ent)) level = "member";
  }

  return { level, hasVerifiedEmail, hasTelegram };
}
