import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyInitData } from "../src/tg/initData";

const TOKEN = "123456:TEST_TOKEN";
function makeInitData(fields: Record<string, string>): string {
  const dataCheck = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  const p = new URLSearchParams(fields);
  p.set("hash", hash);
  return p.toString();
}

describe("verifyInitData", () => {
  const now = Math.floor(Date.parse("2026-06-29T00:00:00Z") / 1000);
  const user = JSON.stringify({ id: 42, first_name: "Joey", username: "joey" });
  it("合法 initData → ok + 解析 user", () => {
    const initData = makeInitData({ user, auth_date: String(now) });
    const r = verifyInitData(initData, TOKEN, 10 ** 9);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.user.id).toBe(42); expect(r.user.username).toBe("joey"); }
  });
  it("篡改 hash → fail", () => {
    const initData = makeInitData({ user, auth_date: String(now) }).replace(/hash=[0-9a-f]+/, "hash=deadbeef");
    expect(verifyInitData(initData, TOKEN, 10 ** 9).ok).toBe(false);
  });
  it("过期 auth_date → fail", () => {
    const initData = makeInitData({ user, auth_date: String(now - 99999) });
    expect(verifyInitData(initData, TOKEN, 3600).ok).toBe(false);
  });
});
