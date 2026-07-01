import { NextResponse } from "next/server";
import { resolveUid } from "@/lib/account/uid";
import { supabaseAdmin } from "@/lib/tg/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request): Promise<Response> {
  const who = await resolveUid(req);
  if (!who || who.via !== "tg") {
    return NextResponse.json({ error: "not_tg_session" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data: list } = await sb.auth.admin.listUsers();
  const taken = list.users.some(
    (u) =>
      u.email?.toLowerCase() === email.toLowerCase() && u.id !== who.uid,
  );
  if (taken) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  const { error: updateError } = await sb.auth.admin.updateUserById(who.uid, {
    email,
  });
  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 },
    );
  }

  const { error: linkError } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) {
    return NextResponse.json({ error: "send_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pending: true });
}
