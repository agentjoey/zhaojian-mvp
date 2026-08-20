import { supabaseAdmin } from "./admin";

export type SpiritMsg = {
  id: string;
  role: "user" | "spirit";
  content: string;
  createdAt: string;
};

type SpiritMsgRow = {
  id: string;
  profile_id: string;
  role: "user" | "spirit";
  content: string;
  created_at: string;
};

const toSpiritMsg = (r: SpiritMsgRow): SpiritMsg => ({
  id: r.id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
});

export async function listMessages(profileId: string): Promise<SpiritMsg[]> {
  const { data, error } = await supabaseAdmin()
    .from("spirit_messages")
    .select("id, profile_id, role, content, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as SpiritMsgRow[] | null)?.map(toSpiritMsg) ?? [];
}

export async function appendMessage(
  profileId: string,
  role: "user" | "spirit",
  content: string,
): Promise<void> {
  const sb = supabaseAdmin();
  // spirit_messages.user_id 为 NOT NULL DEFAULT auth.uid()；service-role 下 auth.uid() 为 NULL，
  // 必须显式带上 user_id（取自档案归属），否则违反非空约束。
  const { data: prof, error: e1 } = await sb
    .from("profiles")
    .select("user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (e1) throw e1;
  if (!prof) throw new Error("profile not found: " + profileId);
  const { error } = await sb.from("spirit_messages").insert({
    profile_id: profileId,
    user_id: (prof as { user_id: string }).user_id,
    role,
    content,
  });
  if (error) throw error;
}

export async function getMemory(profileId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("spirit_memory")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return (data?.spirit_memory as string | null) ?? null;
}

export async function saveMemory(
  profileId: string,
  memory: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("profiles")
    .update({ spirit_memory: memory })
    .eq("id", profileId);
  if (error) throw error;
}

export type DreamHistoryEntry = { id: string; summary: string; createdAt: string };
type DreamHistoryRow = { id: string; summary: string; created_at: string };
const toDreamHistoryEntry = (r: DreamHistoryRow): DreamHistoryEntry => ({ id: r.id, summary: r.summary, createdAt: r.created_at });
const MAX_DREAM_HISTORY = 10;

export async function listDreamHistory(profileId: string): Promise<DreamHistoryEntry[]> {
  const { data, error } = await supabaseAdmin()
    .from("dream_history")
    .select("id, summary, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(MAX_DREAM_HISTORY);
  if (error) throw error;
  return (data as DreamHistoryRow[] | null)?.map(toDreamHistoryEntry) ?? [];
}

/** 追加一条摘要并裁到最近 10 条。同 appendMessage：service-role 下 auth.uid() 为 NULL，须显式带 user_id。 */
export async function appendDreamHistory(profileId: string, summary: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data: prof, error: e1 } = await sb.from("profiles").select("user_id").eq("id", profileId).maybeSingle();
  if (e1) throw e1;
  if (!prof) throw new Error("profile not found: " + profileId);
  const { error } = await sb.from("dream_history").insert({
    profile_id: profileId,
    user_id: (prof as { user_id: string }).user_id,
    summary,
  });
  if (error) throw error;

  const { data: rows, error: listErr } = await sb
    .from("dream_history")
    .select("id")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (listErr) throw listErr;
  const stale = ((rows as { id: string }[] | null) ?? []).slice(MAX_DREAM_HISTORY).map((r) => r.id);
  if (stale.length > 0) {
    const { error: delErr } = await sb.from("dream_history").delete().in("id", stale);
    if (delErr) throw delErr;
  }
}

export async function getQuestionnaire(
  profileId: string,
): Promise<Record<string, string> | null> {
  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .select("questionnaire")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw error;
  return (data?.questionnaire as Record<string, string> | null) ?? null;
}

export async function saveQuestionnaire(
  profileId: string,
  answers: Record<string, string>,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("profiles")
    .update({ questionnaire: answers })
    .eq("id", profileId);
  if (error) throw error;
}
