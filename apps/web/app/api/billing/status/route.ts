import { NextResponse } from "next/server";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { supabaseAdmin } from "@/lib/tg/admin";
import { getEntitlement, isMember } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  let userId: string | undefined;

  // 1) Telegram session (zj_tg cookie)
  const cookieHeader = req.headers.get("cookie") ?? "";
  const tgToken = cookieHeader
    .split("; ")
    .find((c) => c.startsWith(`${TG_COOKIE}=`))
    ?.slice(TG_COOKIE.length + 1);
  const tgSession = readSession(tgToken);
  if (tgSession) {
    userId = tgSession.uid;
  } else {
    // 2) Web session (Authorization Bearer token)
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      const { data } = await supabaseAdmin().auth.getUser(token);
      userId = data.user?.id;
    }
  }

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
