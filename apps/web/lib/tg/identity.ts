import { supabaseAdmin } from "./admin";
import type { BirthInput, UnifiedChart } from "@eamvp/core";
export type Profile = { id: string; nickname: string; birthInput: BirthInput; chart: UnifiedChart; createdAt: string; reading: string | null };
const toProfile = (r: any): Profile => ({ id: r.id, nickname: r.nickname, birthInput: r.birth_input, chart: r.chart, createdAt: r.created_at, reading: r.reading ?? null });

export async function resolveOrCreateTgUser(tg: { id: number; username?: string; lang?: string }, chatId?: number): Promise<{ supabaseUserId: string }> {
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from("tg_users").select("supabase_user_id").eq("tg_user_id", tg.id).maybeSingle();
  if (existing?.supabase_user_id) {
    if (chatId) await sb.from("tg_users").update({ tg_chat_id: chatId, username: tg.username }).eq("tg_user_id", tg.id);
    return { supabaseUserId: existing.supabase_user_id as string };
  }
  const { data: created, error } = await sb.auth.admin.createUser({ email: `tg_${tg.id}@zhaojian.local`, email_confirm: true });
  if (error || !created.user) throw new Error("createUser 失败: " + (error?.message ?? ""));
  const uid = created.user.id;
  const { error: e2 } = await sb.from("tg_users").insert({ tg_user_id: tg.id, supabase_user_id: uid, tg_chat_id: chatId ?? null, username: tg.username ?? null, lang: tg.lang ?? "zh" });
  if (e2) throw e2;
  return { supabaseUserId: uid };
}
export async function getProfileForUser(supabaseUserId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin().from("profiles").select("*").eq("user_id", supabaseUserId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}
export async function createProfileForUser(supabaseUserId: string, input: { nickname?: string; birthInput: BirthInput; chart: UnifiedChart }): Promise<Profile> {
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
