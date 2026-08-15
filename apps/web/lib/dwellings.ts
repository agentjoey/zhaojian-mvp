import { supabase, ensureSession } from "@/lib/supabase";
import type { Direction } from "@eamvp/core";
import { hasTgSession } from "@/lib/tg/client";
import {
  tgListDwellings, tgCreateDwelling, tgUpdateDwelling, tgDeleteDwelling,
} from "@/lib/tg/fengshui";

/**
 * 居所 CRUD（EP-fs-14）。**分流点在本层**（EP-fs-tg，spec §3.2）：TG 会话下走
 * `/api/tg/fengshui` 中介（service_role + 服务端归属校验），否则走 Supabase 匿名
 * 客户端 + RLS。页面只调 `listDwellings()`，不感知自己在哪个宿主里。
 * TG 分支存在的原因：TG 用户没有 Supabase 匿名会话，直连路径拿不到正确的 uid，
 * 居所增删改查在 TG 内原本整条不工作。
 */

export type Dwelling = {
  id: string; name: string;
  kind: "home" | "office";
  tenancy: "rent" | "own";
  /** null = 用户选了「不确定」→ 页面降级回 Layer 0 */
  facing: Direction | null;
  memberProfileIds: string[];
};

type Row = {
  id: string; name: string; kind: string; tenancy: string;
  facing: string | null; member_profile_ids: string[] | null;
};
const toDwelling = (r: Row): Dwelling => ({
  id: r.id, name: r.name,
  kind: r.kind === "office" ? "office" : "home",
  tenancy: r.tenancy === "own" ? "own" : "rent",
  facing: (r.facing as Direction | null) ?? null,
  memberProfileIds: r.member_profile_ids ?? [],
});

export async function listDwellings(): Promise<Dwelling[]> {
  if (hasTgSession()) return tgListDwellings();
  await ensureSession();
  const { data, error } = await supabase()
    .from("dwellings").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toDwelling);
}

export async function createDwelling(d: Omit<Dwelling, "id">): Promise<Dwelling> {
  if (hasTgSession()) return tgCreateDwelling(d);
  const uid = await ensureSession();
  const { data, error } = await supabase().from("dwellings").insert({
    uid, name: d.name, kind: d.kind, tenancy: d.tenancy,
    facing: d.facing, member_profile_ids: d.memberProfileIds,
  }).select("*").single();
  if (error) throw error;
  return toDwelling(data as Row);
}

export async function updateDwelling(id: string, patch: Partial<Omit<Dwelling, "id">>): Promise<void> {
  if (hasTgSession()) return tgUpdateDwelling(id, patch);
  await ensureSession();
  const { error } = await supabase().from("dwellings").update({
    ...(patch.name !== undefined && { name: patch.name }),
    ...(patch.kind !== undefined && { kind: patch.kind }),
    ...(patch.tenancy !== undefined && { tenancy: patch.tenancy }),
    ...(patch.facing !== undefined && { facing: patch.facing }),
    ...(patch.memberProfileIds !== undefined && { member_profile_ids: patch.memberProfileIds }),
    updated_at: new Date().toISOString(),
  }).eq("id", id);
  if (error) throw error;
}

export async function deleteDwelling(id: string): Promise<void> {
  if (hasTgSession()) return tgDeleteDwelling(id);
  await ensureSession();
  const { error } = await supabase().from("dwellings").delete().eq("id", id);
  if (error) throw error;
}
