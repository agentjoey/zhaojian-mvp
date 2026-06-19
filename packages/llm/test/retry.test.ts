import { describe, it, expect } from "vitest";
import { withRetry, isRetryableError } from "../src/retry";

describe("EP-512 withRetry", () => {
  it("瞬时失败两次后成功（共调用 3 次）", async () => {
    let calls = 0;
    const r = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("socket closed");
        return "ok";
      },
      { retries: 2, onRetry: async () => {} },
    );
    expect(r).toBe("ok");
    expect(calls).toBe(3);
  });

  it("不可重试错误（4xx）只调用一次即抛出", async () => {
    let calls = 0;
    const err = Object.assign(new Error("HTTP 400"), { status: 400 });
    await expect(
      withRetry(
        async () => {
          calls++;
          throw err;
        },
        { retries: 2, retryable: isRetryableError, onRetry: async () => {} },
      ),
    ).rejects.toThrow("HTTP 400");
    expect(calls).toBe(1);
  });

  it("超过重试上限后抛出最后错误", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error("always"); }, { retries: 2, onRetry: async () => {} }),
    ).rejects.toThrow("always");
    expect(calls).toBe(3); // 1 + 2 retries
  });

  it("isRetryableError：网络错误(无 status)可重试，5xx/429 可重试，4xx 不可", () => {
    expect(isRetryableError(new Error("fetch failed"))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { status: 503 }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { status: 429 }))).toBe(true);
    expect(isRetryableError(Object.assign(new Error(), { status: 400 }))).toBe(false);
    expect(isRetryableError(Object.assign(new Error(), { status: 401 }))).toBe(false);
  });
});
