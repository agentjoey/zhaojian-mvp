import { NextResponse } from "next/server";
import { verifyTelegramLogin, type TgLoginParams } from "@eamvp/core";
import { resolveUid } from "@/lib/account/uid";
import { supabaseAdmin } from "@/lib/tg/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as TgLoginParams;

  const v = verifyTelegramLogin(body, process.env.TELEGRAM_BOT_TOKEN!);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 401 });
  }

  const resolved = await resolveUid(req);
  if (!resolved || resolved.via !== "web") {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const currentUid = resolved.uid;

  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from("tg_users")
    .select("supabase_user_id")
    .eq("tg_user_id", body.id)
    .maybeSingle();

  if (!existing) {
    const { error } = await sb.from("tg_users").insert({
      tg_user_id: body.id,
      supabase_user_id: currentUid,
      username: body.username ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (existing.supabase_user_id === currentUid) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "conflict" }, { status: 409 });
}
