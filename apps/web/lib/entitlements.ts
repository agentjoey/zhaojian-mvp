import { supabaseAdmin } from "@/lib/tg/admin";
export type Entitlement = { tier: string; memberUntil: string | null };
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const { data } = await supabaseAdmin().from("entitlements").select("tier,member_until").eq("user_id", userId).maybeSingle();
  return { tier: data?.tier ?? "free", memberUntil: (data?.member_until as string | null) ?? null };
}
export function isMember(e: Entitlement): boolean {
  return e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now();
}
