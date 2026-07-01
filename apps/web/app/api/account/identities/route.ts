import { NextResponse } from "next/server";
import { resolveUid } from "@/lib/account/uid";
import { supabaseAdmin } from "@/lib/tg/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const resolved = await resolveUid(req);
  if (!resolved) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { uid } = resolved;

  const { data: u } = await supabaseAdmin().auth.admin.getUserById(uid);
  const rawEmail = u.user?.email ?? null;
  const email =
    rawEmail && !rawEmail.endsWith("@zhaojian.local") ? rawEmail : null;

  const { data: tgRow } = await supabaseAdmin()
    .from("tg_users")
    .select("username")
    .eq("supabase_user_id", uid)
    .maybeSingle();

  return NextResponse.json({
    email,
    telegram: tgRow ? { username: tgRow.username ?? null } : null,
  });
}
