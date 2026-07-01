import { supabaseAdmin } from "@/lib/tg/admin";
export type Entitlement = { tier: string; memberUntil: string | null };
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const { data } = await supabaseAdmin().from("entitlements").select("tier,member_until").eq("user_id", userId).maybeSingle();
  return { tier: data?.tier ?? "free", memberUntil: (data?.member_until as string | null) ?? null };
}
export function isMember(e: Entitlement): boolean {
  return e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now();
}

export async function consumeLlm(userId: string): Promise<{ ok: boolean; reason?: "paywall" }> {
  if (process.env.BILLING_ENABLED !== "1") return { ok: true };            // pre-prod 放行
  const ent = await getEntitlement(userId);
  if (isMember(ent)) return { ok: true };                                   // 会员无限
  const free = Number(process.env.FREE_LLM_MONTHLY ?? 30);
  const { data } = await supabaseAdmin().rpc("consume_llm_credit_account", { p_user_id: userId, p_free: free });
  return data === true ? { ok: true } : { ok: false, reason: "paywall" };
}
