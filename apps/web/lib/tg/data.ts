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
  const { error } = await supabaseAdmin().from("spirit_messages").insert({
    profile_id: profileId,
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
