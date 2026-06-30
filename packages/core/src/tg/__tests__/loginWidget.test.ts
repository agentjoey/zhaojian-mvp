import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramLogin, type TgLoginParams } from "../loginWidget";

const botToken = "123:ABC";

function signWidgetParams(params: Omit<TgLoginParams, "hash">): TgLoginParams {
  const dataCheckString = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHash("sha256").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return { ...params, hash };
}

describe("verifyTelegramLogin", () => {
  it("accepts a valid widget payload", () => {
    const params = signWidgetParams({
      id: 123456,
      auth_date: Math.floor(Date.now() / 1000),
      first_name: "Test",
      username: "testuser",
    });
    const result = verifyTelegramLogin(params, botToken);
    expect(result).toEqual({ ok: true, id: 123456, username: "testuser" });
  });

  it("rejects a tampered field", () => {
    const params = signWidgetParams({
      id: 123456,
      auth_date: Math.floor(Date.now() / 1000),
      username: "testuser",
    });
    const tampered = { ...params, username: "attacker" };
    const result = verifyTelegramLogin(tampered, botToken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid hash");
  });

  it("rejects a stale auth_date", () => {
    const params = signWidgetParams({
      id: 123456,
      auth_date: Math.floor(Date.now() / 1000) - 100000,
      username: "testuser",
    });
    const result = verifyTelegramLogin(params, botToken, 86400);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("expired");
  });

  it("rejects missing hash", () => {
    const { hash: _, ...params } = signWidgetParams({
      id: 1,
      auth_date: Math.floor(Date.now() / 1000),
    });
    const result = verifyTelegramLogin(params as TgLoginParams, botToken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing hash");
  });

  it("rejects missing auth_date", () => {
    const params = signWidgetParams({ id: 1, auth_date: Math.floor(Date.now() / 1000) });
    const { auth_date: _, ...withoutAuthDate } = params;
    const result = verifyTelegramLogin(withoutAuthDate as TgLoginParams, botToken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("missing auth_date");
  });
});
