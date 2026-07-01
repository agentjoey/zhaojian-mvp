import { NextResponse } from "next/server";
import { resolveUid } from "@/lib/account/uid";
import { supabaseAdmin } from "@/lib/tg/admin";
import { TG_COOKIE } from "@/lib/tg/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TG_HINT_COOKIE = "zj_tg_hint";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: "缺少确认标志" },
      { status: 400 },
    );
  }

  const who = await resolveUid(req);
  if (!who) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { error } = await supabaseAdmin().auth.admin.deleteUser(who.uid);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(TG_COOKIE, "", { maxAge: 0, path: "/" });
  res.cookies.set(TG_HINT_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}
