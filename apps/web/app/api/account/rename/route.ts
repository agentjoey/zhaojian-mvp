import { NextResponse } from "next/server";
import { resolveUid } from "@/lib/account/uid";
import { supabaseAdmin } from "@/lib/tg/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const who = await resolveUid(req);
  if (!who) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const profileId = body?.profileId;
  const nickname = typeof body?.nickname === "string" ? body.nickname : "";
  const trimmed = nickname.trim();

  if (!profileId || typeof profileId !== "string") {
    return NextResponse.json({ error: "缺少 profileId" }, { status: 400 });
  }
  if (trimmed.length < 1 || trimmed.length > 24) {
    return NextResponse.json({ error: "昵称长度应为 1-24 字符" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("profiles")
    .update({ nickname: trimmed })
    .eq("id", profileId)
    .eq("user_id", who.uid)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "档案不存在或无权限" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
