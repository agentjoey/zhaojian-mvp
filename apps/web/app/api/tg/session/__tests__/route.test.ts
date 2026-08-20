// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

afterEach(() => vi.unstubAllEnvs());

const { GET } = await import("../route");
const { makeSessionToken, SESSION_REFRESH_THRESHOLD_SECONDS, TG_COOKIE } = await import("@/lib/tg/session");

function reqWithCookie(cookie?: string): Request {
  return new Request("http://x/api/tg/session", cookie ? { headers: { cookie } } : {});
}

beforeEach(() => {
  vi.clearAllMocks();
  // stubEnv 放 beforeEach：afterEach 的 unstubAllEnvs 会把它清掉，每个用例都要重新打。
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
});

describe("GET /api/tg/session：确认 + 按需续期 + 无效清 cookie（EP-account2-03）", () => {
  it("无 cookie → active=false，响应里带清 cookie 的 Set-Cookie（maxAge=0）", async () => {
    const res = await GET(reqWithCookie());
    const json = await res.json();
    expect(json).toEqual({ active: false, refreshed: false });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${TG_COOKIE}=;`);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("有效且远未到期的 cookie → active=true，refreshed=false，不重签", async () => {
    const token = makeSessionToken("u1", 42);
    const res = await GET(reqWithCookie(`${TG_COOKIE}=${token}`));
    const json = await res.json();
    expect(json).toEqual({ active: true, refreshed: false });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("有效但快过期（剩余 < 7 天）→ active=true，refreshed=true，响应里带新 cookie", async () => {
    const { signSession } = await import("@eamvp/core");
    const exp = Math.floor(Date.now() / 1000) + SESSION_REFRESH_THRESHOLD_SECONDS - 10;
    const token = signSession({ uid: "u1", tgId: 42, exp }, "test-secret");
    const res = await GET(reqWithCookie(`${TG_COOKIE}=${token}`));
    const json = await res.json();
    expect(json).toEqual({ active: true, refreshed: true });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${TG_COOKIE}=`);
    expect(setCookie).not.toContain(`${TG_COOKIE}=;`); // 是新值，不是清空
  });

  it("cookie 被篡改/过期 → active=false 且清 cookie", async () => {
    const res = await GET(reqWithCookie(`${TG_COOKIE}=garbage`));
    const json = await res.json();
    expect(json.active).toBe(false);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/Max-Age=0/i);
  });
});
