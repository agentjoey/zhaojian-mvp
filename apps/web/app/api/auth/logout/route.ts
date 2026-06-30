import { NextResponse } from "next/server";
import { TG_COOKIE } from "@/lib/tg/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TG_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.cookies.set("zj_tg_hint", "", {
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
