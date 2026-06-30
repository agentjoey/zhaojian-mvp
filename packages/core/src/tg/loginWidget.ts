import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type TgLoginParams = {
  id: number;
  auth_date: number;
  hash: string;
  username?: string;
  first_name?: string;
  photo_url?: string;
  [k: string]: unknown;
};

export function verifyTelegramLogin(
  p: TgLoginParams,
  botToken: string,
  maxAgeSec = 86400,
): { ok: true; id: number; username?: string } | { ok: false; error: string } {
  if (!p || typeof p.hash !== "string" || !p.hash) {
    return { ok: false, error: "missing hash" };
  }
  if (typeof p.auth_date !== "number" || !p.auth_date) {
    return { ok: false, error: "missing auth_date" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now - p.auth_date > maxAgeSec) {
    return { ok: false, error: "expired" };
  }

  const { hash, ...rest } = p;
  const dataCheckString = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "invalid hash" };
  }

  return { ok: true, id: p.id, username: p.username };
}
