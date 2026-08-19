import { supabaseAdmin } from "./admin";
import { getEntitlement, isMember } from "@/lib/entitlements";
import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/access";
import { recordConsentOnce, TERMS_VERSION } from "@/lib/consent";
import type { BirthInput, UnifiedChart } from "@eamvp/core";
export type Profile = { id: string; nickname: string; birthInput: BirthInput; chart: UnifiedChart; createdAt: string; reading: string | null };
/** DB 行 → 领域对象。行来自 Supabase 的松散返回，用最小结构类型而非 any——
 * any 会让下面每个字段名的拼写错误都静默通过。 */
type ProfileRow = { id: string; nickname: string; birth_input: BirthInput; chart: UnifiedChart; created_at: string; reading?: string | null };
const toProfile = (r: ProfileRow): Profile => ({ id: r.id, nickname: r.nickname, birthInput: r.birth_input, chart: r.chart, createdAt: r.created_at, reading: r.reading ?? null });

export async function resolveOrCreateTgUser(tg: { id: number; username?: string; lang?: string }, chatId?: number, ref?: string): Promise<{ supabaseUserId: string }> {
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from("tg_users").select("supabase_user_id, ref").eq("tg_user_id", tg.id).maybeSingle();
  if (existing?.supabase_user_id) {
    const upd: { tg_chat_id?: number; username?: string; ref?: string } = {};
    if (chatId) { upd.tg_chat_id = chatId; upd.username = tg.username; }
    if (ref && !existing.ref) upd.ref = ref;
    if (Object.keys(upd).length > 0) await sb.from("tg_users").update(upd).eq("tg_user_id", tg.id);
    return { supabaseUserId: existing.supabase_user_id as string };
  }
  // 实测确认（EP-account2-08 Step 1，真实 Supabase 项目，2026-08-19）：auth.admin.createUser({}) 不带 email 会失败——
  // Supabase 要求必须有 email 或 phone 才能建用户（400 "Cannot create a user without either an email or phone"）。
  // 只能保留合成邮箱这条路，但 resolveAccess 的 hasVerifiedEmail 判定已经显式排除这个域名（Task 1），
  // 「已验证邮箱」这个信号依然诚实——不依赖「影子邮箱已被消灭」这个假设，
  // 这正是 spec §3 要求判定函数「两种情况都正确」的意思。
  const { data: created, error } = await sb.auth.admin.createUser({ email: `tg_${tg.id}@${SYNTHETIC_EMAIL_DOMAIN}`, email_confirm: true });
  if (error || !created.user) throw new Error("createUser 失败: " + (error?.message ?? ""));
  const uid = created.user.id;
  const { error: e2 } = await sb.from("tg_users").insert({ tg_user_id: tg.id, supabase_user_id: uid, tg_chat_id: chatId ?? null, username: tg.username ?? null, lang: tg.lang ?? "zh", ref: ref ?? null });
  if (e2) throw e2;
  void recordConsentOnce(uid, "terms", TERMS_VERSION); // best-effort，不 await——不能因为条款记录失败而拖慢/搞砸 TG 建号
  return { supabaseUserId: uid };
}
export async function getProfileForUser(supabaseUserId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin().from("profiles").select("*").eq("user_id", supabaseUserId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}
export async function createProfileForUser(supabaseUserId: string, input: { nickname?: string; birthInput: BirthInput; chart: UnifiedChart }): Promise<Profile> {
  if (process.env.BILLING_ENABLED === "1") {
    if (!isMember(await getEntitlement(supabaseUserId))) {
      const { count } = await supabaseAdmin().from("profiles").select("id", { count: "exact", head: true }).eq("user_id", supabaseUserId);
      if ((count ?? 0) >= Number(process.env.FREE_PROFILE_LIMIT ?? 3)) {
        throw new Error("profile_limit");
      }
    }
  }
  const { data, error } = await supabaseAdmin().from("profiles").insert({ user_id: supabaseUserId, nickname: input.nickname?.trim() || "无名", birth_input: input.birthInput, chart: input.chart }).select("*").single();
  if (error) throw error;
  return toProfile(data);
}
export async function listProfilesForUser(supabaseUserId: string): Promise<Profile[]> {
  const { data, error } = await supabaseAdmin().from("profiles").select("*").eq("user_id", supabaseUserId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toProfile);
}
export async function deleteProfileForUser(supabaseUserId: string, profileId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("profiles").delete().eq("id", profileId).eq("user_id", supabaseUserId);
  if (error) throw error;
}
