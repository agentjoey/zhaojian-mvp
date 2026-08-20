import { NextResponse } from "next/server";
import { verifyTelegramLogin, type TgLoginParams } from "@eamvp/core";
import { resolveUid } from "@/lib/account/uid";
import { attachIdentity, completeEmailAttach, type AttachError } from "@/lib/tg/identity-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function errorStatus(error: AttachError): number {
  if (error === "taken" || error === "already_attached") return 409;
  if (error === "send_failed") return 500;
  return 400; // no_pending / unverified
}

/**
 * POST /api/account/attach —— 对称化的身份绑定入口（EP-account2-04），取代
 * 此前各带各鉴权前提的 link-email/link-telegram。任何有效会话（TG 或 web）
 * 都可以绑定本账号尚未拥有的身份类型；不再要求「必须是没用来登录的那个」。
 *
 * email 是两阶段流程（EP-account2-fix 阻断 1）：
 *   阶段 1 {kind:"email", email}        —— 只校验 + 记录意向，不写邮箱、不发信；
 *                                          发信由客户端走既有 signInWithOtp（真发信）。
 *   阶段 2 {kind:"email", phase:"complete"} —— 用户点验证链接后由 /auth/callback
 *                                          携 Bearer 调用，此时才真正写入邮箱。
 */
export async function POST(req: Request): Promise<Response> {
  const who = await resolveUid(req);

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown } & Record<string, unknown>;

  if (body.kind === "email" && body.phase === "complete") {
    const auth = req.headers.get("authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "missing_token" }, { status: 400 });
    }
    const r = await completeEmailAttach({
      tgUid: who?.via === "tg" ? who.uid : null,
      bearerToken: token,
    });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: errorStatus(r.error) });
    }
    return NextResponse.json({ ok: true });
  }

  if (!who) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (body.kind === "email") {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    const r = await attachIdentity(who.uid, { kind: "email", email });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: errorStatus(r.error) });
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
      return NextResponse.json({ error: r.error }, { status: errorStatus(r.error) });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_kind" }, { status: 400 });
}
