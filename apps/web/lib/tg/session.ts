import { signSession, verifySession } from "@eamvp/core";

export const TG_COOKIE = "zj_tg";

/** 30 天滑动会话——无状态签名 cookie，无服务端吊销（已接受的权衡，spec §4①）。 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
/** 剩余时间少于这个阈值时，下一次已鉴权请求上重新签发。 */
export const SESSION_REFRESH_THRESHOLD_SECONDS = 60 * 60 * 24 * 7;

export function makeSessionToken(uid: string, tgId: number): string {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET 未配置");
  return signSession({ uid, tgId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }, secret);
}

export function readSession(token: string | undefined): { uid: string; tgId: number; exp: number } | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return null;
  return verifySession(token, secret);
}

/** exp 距现在不足 SESSION_REFRESH_THRESHOLD_SECONDS → 该续期了。 */
export function sessionNeedsRefresh(exp: number): boolean {
  return exp - Math.floor(Date.now() / 1000) < SESSION_REFRESH_THRESHOLD_SECONDS;
}
