import { signSession, verifySession } from "@eamvp/core";
export const TG_COOKIE = "zj_tg";
export function makeSessionToken(uid: string, tgId: number): string {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET 未配置");
  return signSession({ uid, tgId, exp: Math.floor(Date.now() / 1000) + 3600 }, secret);
}
export function readSession(token: string | undefined): { uid: string; tgId: number } | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return null;
  return verifySession(token, secret);
}
