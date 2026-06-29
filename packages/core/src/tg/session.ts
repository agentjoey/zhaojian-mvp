import { createHmac, timingSafeEqual } from "node:crypto";

function base64urlEncode(buf: Buffer): string {
  return buf.toString("base64url").replace(/=+$/, "");
}

function base64urlDecode(s: string): Buffer {
  const pad = (4 - (s.length % 4)) % 4;
  return Buffer.from(s + "=".repeat(pad), "base64url");
}

export function signSession(payload: { uid: string; tgId: number; exp: number }, secret: string): string {
  const header = base64urlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = base64urlEncode(createHmac("sha256", secret).update(header).digest());
  return `${header}.${sig}`;
}

export function verifySession(token: string, secret: string): { uid: string; tgId: number } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [header, sig] = parts;
  const expected = base64urlEncode(createHmac("sha256", secret).update(header).digest());
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(header).toString("utf8"));
    if (!payload || typeof payload.uid !== "string" || typeof payload.tgId !== "number" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return { uid: payload.uid, tgId: payload.tgId };
  } catch {
    return null;
  }
}
