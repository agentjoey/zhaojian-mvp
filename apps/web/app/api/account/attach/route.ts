import { NextResponse } from "next/server";
import { verifyTelegramLogin, type TgLoginParams } from "@eamvp/core";
import { resolveUid } from "@/lib/account/uid";
import { supabaseAdmin } from "@/lib/tg/admin";
import { attachIdentity, completeEmailAttach, peekEmailBind, type AttachError } from "@/lib/tg/identity-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function errorStatus(error: AttachError): number {
  if (error === "taken" || error === "already_attached") return 409;
  if (error === "send_failed") return 500;
  // no_pending / unverified / email_mismatch / orphan_has_data
  return 400;
}

function bearerOf(req: Request): string | null {
  const auth = req.headers.get("authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

/**
 * POST /api/account/attach —— 对称化的身份绑定入口（EP-account2-04），取代
 * 此前各带各鉴权前提的 link-email/link-telegram。任何有效会话（TG 或 web）
 * 都可以绑定本账号尚未拥有的身份类型；不再要求「必须是没用来登录的那个」。
 *
 * email 是两阶段流程（重设计，见 lib/tg/identity-link.ts 顶部说明）：
 *   阶段 1 {kind:"email", email}                   —— 只校验 + 发一次性 nonce，
 *                                                     不写邮箱、不发信；发信由客户端
 *                                                     走 signInWithOtp，把 nonce 拼进
 *                                                     emailRedirectTo。
 *   预览  {kind:"email", phase:"peek", nonce}      —— 确认屏用，只读不消费。
 *   阶段 2 {kind:"email", phase:"complete", nonce} —— 用户在确认屏点确认后调用，
 *                                                     此时才真正写入邮箱。
 *
 * ⚠️ complete/peek 的账号选择**只认 nonce**，不按邮箱字符串反查。旧实现按邮箱
 * 全库找「谁声明过要绑这个邮箱」，使得任何人都能为一个尚未注册的邮箱预埋意向，
 * 等真正的所有者首次注册、/auth/callback 无条件触发 complete 时把对方账号吞掉。
 */
export async function POST(req: Request): Promise<Response> {
  const who = await resolveUid(req);

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown } & Record<string, unknown>;

  if (body.kind === "email" && (body.phase === "complete" || body.phase === "peek")) {
    const token = bearerOf(req);
    if (!token) {
      return NextResponse.json({ error: "missing_token" }, { status: 400 });
    }
    const nonce = typeof body.nonce === "string" ? body.nonce : "";
    if (!nonce) {
      return NextResponse.json({ error: "no_pending" }, { status: 400 });
    }

    if (body.phase === "peek") {
      const { data } = await supabaseAdmin().auth.getUser(token);
      const r = await peekEmailBind(nonce, data.user?.id ?? null);
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: errorStatus(r.error) });
      return NextResponse.json({ ok: true, ...r.preview });
    }

    const r = await completeEmailAttach({ nonce, bearerToken: token });
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
    // nonce 回给客户端拼 emailRedirectTo——它是这条绑定链路的账号选择依据。
    return NextResponse.json({ ok: true, pending: true, nonce: (r as { nonce: string }).nonce });
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
