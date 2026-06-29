import { createHmac, timingSafeEqual } from "node:crypto";

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
export type VerifyResult = { ok: true; user: TgUser; authDate: number } | { ok: false; reason: string };

/** Telegram WebApp initData 校验（官方算法）。maxAgeSec 默认 86400。 */
export function verifyInitData(initData: string, botToken: string, maxAgeSec = 86400): VerifyResult {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing hash" };
  params.delete("hash");
  const dataCheckString = [...params.entries()].map(([k, v]) => [k, v] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad hash" };
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || (Date.now() / 1000 - authDate) > maxAgeSec) return { ok: false, reason: "expired" };
  let user: TgUser;
  try { user = JSON.parse(params.get("user") ?? "{}"); } catch { return { ok: false, reason: "bad user json" }; }
  if (!user?.id) return { ok: false, reason: "no user id" };
  return { ok: true, user, authDate };
}
