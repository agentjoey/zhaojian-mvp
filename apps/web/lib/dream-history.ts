"use client";

import { supabase, ensureSession } from "./supabase";

/**
 * 解梦历史（EP-dream-history + EP-dream-history-2）——存 summary（第三人称主题摘要，
 * 供列表展示）+ fullText（灵的解读全文，供点击续追问用）。不存梦原文（迁移 0018
 * 的注释）：`fullText` 是灵自己生成、已过 sanitizeDream 等全套后置链的输出，不是
 * 用户的原始陈述，不违反「梦原文不落库」的红线。迁移前写入的旧行没有 fullText
 * （可能为 null）——那些条目只能当摘要展示，续接功能对它们降级不可用。
 */
export type DreamHistoryEntry = {
  id: string;
  summary: string;
  fullText: string | null;
  createdAt: string;
};

type Row = { id: string; summary: string; full_text: string | null; created_at: string };
const toEntry = (r: Row): DreamHistoryEntry => ({ id: r.id, summary: r.summary, fullText: r.full_text, createdAt: r.created_at });

const MAX_DREAM_HISTORY = 10;

export async function listDreamHistory(profileId: string): Promise<DreamHistoryEntry[]> {
  await ensureSession();
  const { data, error } = await supabase()
    .from("dream_history")
    .select("id, summary, full_text, created_at")
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(MAX_DREAM_HISTORY);
  if (error) throw error;
  return (data as Row[] | null)?.map(toEntry) ?? [];
}

/** 追加一条历史（摘要 + 解读全文），并把超出最近 10 条的旧行直接删除（不做归档）。 */
export async function appendDreamHistory(profileId: string, summary: string, fullText: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase().from("dream_history").insert({ profile_id: profileId, summary, full_text: fullText });
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
