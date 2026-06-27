"use client";

import { supabase, ensureSession } from "./supabase";

export type SpiritMessage = {
  id: string;
  role: "user" | "spirit";
  content: string;
  createdAt: string;
};

type Row = {
  id: string;
  profile_id: string;
  role: "user" | "spirit";
  content: string;
  created_at: string;
};

const toMessage = (r: Row): SpiritMessage => ({
  id: r.id,
  role: r.role,
  content: r.content,
  createdAt: r.created_at,
});

export async function listMessages(profileId: string): Promise<SpiritMessage[]> {
  await ensureSession();
  const { data, error } = await supabase()
    .from("spirit_messages")
    .select("id, profile_id, role, content, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Row[] | null)?.map(toMessage) ?? [];
}

export async function appendMessage(
  profileId: string,
  role: "user" | "spirit",
  content: string,
): Promise<void> {
  await ensureSession();
  const { error } = await supabase().from("spirit_messages").insert({
    profile_id: profileId,
    role,
    content,
  });
  if (error) throw error;
}
