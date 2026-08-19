import { NextResponse } from "next/server";
import { verifyTelegramLogin, type TgLoginParams } from "@eamvp/core";
import { resolveUid } from "@/lib/account/uid";
import { attachIdentity } from "@/lib/tg/identity-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST /api/account/attach —— 对称化的身份绑定入口（EP-account2-04），取代
 * 此前各带各鉴权前提的 link-email/link-telegram。任何有效会话（TG 或 web）
 * 都可以绑定本账号尚未拥有的身份类型；不再要求「必须是没用来登录的那个」。
 */
export async function POST(req: Request): Promise<Response> {
  const who = await resolveUid(req);
  if (!who) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown } & Record<string, unknown>;

  if (body.kind === "email") {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    const r = await attachIdentity(who.uid, { kind: "email", email });
    if (!r.ok) {
      const status = r.error === "taken" ? 409 : 500;
      return NextResponse.json({ error: r.error }, { status });
    }
    return NextResponse.json({ ok: true, pending: true });
  }

  if (body.kind === "telegram") {
    const v = verifyTelegramLogin(body as unknown as TgLoginParams, process.env.TELEGRAM_BOT_TOKEN!);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 401 });
    }
    const r = await attachIdentity(who.uid, { kind: "telegram", tgId: v.id, username: v.username });
    if (!r.ok) {
      const status = r.error === "already_attached" ? 409 : 500;
      return NextResponse.json({ error: r.error }, { status });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_kind" }, { status: 400 });
}
