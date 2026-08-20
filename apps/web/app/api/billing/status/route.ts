import { NextResponse } from "next/server";
import { resolveUid } from "@/lib/account/uid";
import { supabaseAdmin } from "@/lib/tg/admin";
import { getEntitlement, isMember } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const resolved = await resolveUid(req);
  const userId = resolved?.uid;

  const free = Number(process.env.FREE_LLM_MONTHLY ?? 30);

  if (!userId) {
    return NextResponse.json({ tier: "free", memberUntil: null, used: 0, free });
  }

  const ent = await getEntitlement(userId);
  const member = isMember(ent);
  const period = new Date().toISOString().slice(0, 7);
  const { data: usage } = await supabaseAdmin()
    .from("llm_usage")
    .select("uses")
    .eq("user_id", userId)
    .eq("period", period)
    .maybeSingle();
  const used = usage?.uses ?? 0;

  return NextResponse.json({
    tier: member ? "member" : ent.tier,
    memberUntil: ent.memberUntil,
    used,
    free,
  });
}
