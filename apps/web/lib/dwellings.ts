import { supabase, ensureSession } from "@/lib/supabase";
import type { Direction } from "@eamvp/core";

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
  await ensureSession();
  const { data, error } = await supabase()
    .from("dwellings").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toDwelling);
}

export async function createDwelling(d: Omit<Dwelling, "id">): Promise<Dwelling> {
  const uid = await ensureSession();
  const { data, error } = await supabase().from("dwellings").insert({
    uid, name: d.name, kind: d.kind, tenancy: d.tenancy,
    facing: d.facing, member_profile_ids: d.memberProfileIds,
  }).select("*").single();
  if (error) throw error;
  return toDwelling(data as Row);
}

export async function updateDwelling(id: string, patch: Partial<Omit<Dwelling, "id">>): Promise<void> {
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
  await ensureSession();
  const { error } = await supabase().from("dwellings").delete().eq("id", id);
  if (error) throw error;
}
