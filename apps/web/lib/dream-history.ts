"use client";

import { supabase, ensureSession } from "./supabase";

/** 解梦历史（EP-dream-history）——只存 summary（第三人称主题摘要），不存梦原文。 */
export type DreamHistoryEntry = {
  id: string;
  summary: string;
  createdAt: string;
};

type Row = { id: string; summary: string; created_at: string };
const toEntry = (r: Row): DreamHistoryEntry => ({ id: r.id, summary: r.summary, createdAt: r.created_at });

const MAX_DREAM_HISTORY = 10;

export async function listDreamHistory(profileId: string): Promise<DreamHistoryEntry[]> {
  await ensureSession();
  const { data, error } = await supabase()
    .from("dream_history")
    .select("id, summary, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(MAX_DREAM_HISTORY);
  if (error) throw error;
  return (data as Row[] | null)?.map(toEntry) ?? [];
}

/** 追加一条摘要，并把超出最近 10 条的旧行直接删除（不做归档——本表本来就只存摘要）。 */
export async function appendDreamHistory(profileId: string, summary: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase().from("dream_history").insert({ profile_id: profileId, summary });
  if (error) throw error;

  const { data: rows, error: listErr } = await supabase()
    .from("dream_history")
    .select("id")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false });
  if (listErr) throw listErr;
  const stale = ((rows as { id: string }[] | null) ?? []).slice(MAX_DREAM_HISTORY).map((r) => r.id);
  if (stale.length > 0) {
    const { error: delErr } = await supabase().from("dream_history").delete().in("id", stale);
    if (delErr) throw delErr;
  }
}
