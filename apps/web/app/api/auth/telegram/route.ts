import { NextResponse } from "next/server";
import { verifyTelegramLogin } from "@eamvp/core";
import { resolveOrCreateTgUser } from "@/lib/tg/identity";
import { makeSessionToken, TG_COOKIE } from "@/lib/tg/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "TG 未配置" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const v = verifyTelegramLogin(body, token);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 401 });
  }

  const { supabaseUserId } = await resolveOrCreateTgUser({ id: v.id, username: v.username });

  const res = NextResponse.json({ ok: true });
  const maxAge = 60 * 60 * 24 * 30;
  res.cookies.set(TG_COOKIE, makeSessionToken(supabaseUserId, v.id), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  res.cookies.set("zj_tg_hint", "1", {
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
