import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const { makeSessionToken, readSession, sessionNeedsRefresh, SESSION_TTL_SECONDS, SESSION_REFRESH_THRESHOLD_SECONDS } =
  await import("../session");

describe("会话 TTL：单一常量驱动（EP-account2-02）", () => {
  it("makeSessionToken 签发的 exp 精确等于 now + SESSION_TTL_SECONDS（不再是硬编码 3600）", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = makeSessionToken("u1", 42);
    const s = readSession(token)!;
    expect(s.exp).toBeGreaterThanOrEqual(before + SESSION_TTL_SECONDS);
    expect(s.exp).toBeLessThanOrEqual(before + SESSION_TTL_SECONDS + 5); // 5s 执行余量
  });

  it("SESSION_TTL_SECONDS 是 30 天", () => {
    expect(SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  it("sessionNeedsRefresh：剩余时间 < 阈值 → true；>= 阈值 → false", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(sessionNeedsRefresh(now + SESSION_REFRESH_THRESHOLD_SECONDS - 1)).toBe(true);
    expect(sessionNeedsRefresh(now + SESSION_REFRESH_THRESHOLD_SECONDS + 1)).toBe(false);
  });

  it("SESSION_REFRESH_THRESHOLD_SECONDS 是 7 天", () => {
    expect(SESSION_REFRESH_THRESHOLD_SECONDS).toBe(60 * 60 * 24 * 7);
  });
});
