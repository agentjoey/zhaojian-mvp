import { NextResponse } from "next/server";
import { verifyInitData } from "@eamvp/core";
import { resolveOrCreateTgUser, getProfileForUser } from "@/lib/tg/identity";
import {
  makeSessionToken,
  readSession,
  sessionNeedsRefresh,
  TG_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/tg/session";

const TG_HINT_COOKIE = "zj_tg_hint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const cookie = req.headers.get("cookie") ?? "";
  const token = cookie.split("; ").find((c) => c.startsWith(`${TG_COOKIE}=`))?.slice(TG_COOKIE.length + 1);
  const session = readSession(token);

  if (!session) {
    const res = NextResponse.json({ active: false, refreshed: false });
    res.cookies.set(TG_COOKIE, "", { maxAge: 0, path: "/" });
    res.cookies.set(TG_HINT_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  }

  if (sessionNeedsRefresh(session.exp)) {
    const res = NextResponse.json({ active: true, refreshed: true });
    const fresh = makeSessionToken(session.uid, session.tgId);
    res.cookies.set(TG_COOKIE, fresh, {
      httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: SESSION_TTL_SECONDS,
    });
    res.cookies.set(TG_HINT_COOKIE, "1", { secure: true, sameSite: "none", path: "/", maxAge: SESSION_TTL_SECONDS });
    return res;
  }

  return NextResponse.json({ active: true, refreshed: false });
}
export async function POST(req: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return new Response("TG 未配置", { status: 503 });
  const body: unknown = await req.json().catch(() => ({}));
  const initData = (body as { initData?: unknown } | null)?.initData;
  if (typeof initData !== "string") return new Response("缺少 initData", { status: 400 });
  const v = verifyInitData(initData, token);
  if (!v.ok) return new Response("initData 校验失败: " + v.reason, { status: 401 });
  const { supabaseUserId } = await resolveOrCreateTgUser({ id: v.user.id, username: v.user.username, lang: v.user.language_code });
  const profile = await getProfileForUser(supabaseUserId);
  const res = NextResponse.json({ ok: true, hasProfile: !!profile });
  res.cookies.set(TG_COOKIE, makeSessionToken(supabaseUserId, v.user.id), {
    httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
