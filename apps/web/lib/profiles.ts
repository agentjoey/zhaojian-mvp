"use client";

import type { UnifiedChart, BirthInput } from "@eamvp/core";
import { supabase, ensureSession } from "./supabase";

/**
 * 档案（Supabase，匿名登录 + RLS）—— EP-007/EP-DB。
 * 建档时命盘一次生成并冻结（不提供 update）。每行按 auth.uid() 行级隔离。
 * 「当前档案」指针存 localStorage（仅 id，非敏感），档案本体在 DB。
 */
export type Profile = {
  id: string;
  nickname: string;
  birthInput: BirthInput;
  chart: UnifiedChart;
  createdAt: string;
  reading: string | null; // 已生成的解读 markdown（一次生成后保存）
};

const ACTIVE_KEY = "zhaojian.activeProfileId";

type Row = { id: string; nickname: string; birth_input: BirthInput; chart: UnifiedChart; created_at: string; reading: string | null };
const toProfile = (r: Row): Profile => ({
  id: r.id,
  nickname: r.nickname,
  birthInput: r.birth_input,
  chart: r.chart,
  createdAt: r.created_at,
  reading: r.reading ?? null,
});

export async function listProfiles(): Promise<Profile[]> {
  await ensureSession();
  const { data, error } = await supabase().from("profiles").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(toProfile);
}

export async function getProfile(id: string): Promise<Profile | null> {
  await ensureSession();
  const { data, error } = await supabase().from("profiles").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data as Row) : null;
}

export function getActiveProfileId(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null;
}
export function setActiveProfile(id: string): void {
  localStorage.setItem(ACTIVE_KEY, id);
}

/** 当前档案：localStorage 指针优先，否则取最近一条。 */
export async function getActiveProfile(): Promise<Profile | null> {
  const list = await listProfiles();
  if (list.length === 0) return null;
  const id = getActiveProfileId();
  return (id && list.find((p) => p.id === id)) || list[0]!;
}

/** 建档：命盘已在外部一次算好并传入，此处冻结写入 DB。 */
export async function createProfile(input: {
  nickname?: string;
  birthInput: BirthInput;
  chart: UnifiedChart;
}): Promise<Profile> {
  const userId = await ensureSession();
  const { data, error } = await supabase()
    .from("profiles")
    .insert({
      user_id: userId,
      nickname: input.nickname?.trim() || "无名",
      birth_input: input.birthInput,
      chart: input.chart,
    })
    .select("*")
    .single();
  if (error) throw error;
  const profile = toProfile(data as Row);
  setActiveProfile(profile.id);
  return profile;
}

/** 保存生成好的解读（命盘冻结，仅写 reading*）。一次生成后即持久化。 */
export async function saveReading(profileId: string, markdown: string, model?: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase()
    .from("profiles")
    .update({ reading: markdown, reading_model: model ?? null, reading_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) throw error;
}

export async function deleteProfile(id: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase().from("profiles").delete().eq("id", id);
  if (error) throw error;
  if (getActiveProfileId() === id) localStorage.removeItem(ACTIVE_KEY);
}

/** 关系记忆读（EP-spirit-05）。spirit_memory 为 jsonb，存的是一段摘要字符串。 */
export async function getSpiritMemory(profileId: string): Promise<string | null> {
  await ensureSession();
  const { data, error } = await supabase().from("profiles").select("spirit_memory").eq("id", profileId).maybeSingle();
  if (error) throw error;
  return (data?.spirit_memory as string | null) ?? null;
}

export async function saveSpiritMemory(profileId: string, memory: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase().from("profiles").update({ spirit_memory: memory }).eq("id", profileId);
  if (error) throw error;
}
