import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Telegram webhook 的核心契约：**先回 200，再处理 update**。
 *
 * 此前这里是 `webhookCallback(bot, "std/http")`，它会 await 整个 handler 才返回。
 * `/today` 的 handler 包着一次完整 LLM 生成，远超 Vercel Hobby 的函数时长上限，
 * Telegram 收不到 200 就**重投同一条 update**，而代码里没有去重 → 重新生成一次 →
 * 用户一条指令收到三条内容各不相同的回复，顺序还乱（三次并发生成先后不定）。
 *
 * 所以本文件测的不是「返回了 200」，而是「**在 handleUpdate 完成之前**就返回了 200」——
 * 前者对旧实现同样成立，抓不到这个 bug。
 */

const handleUpdate = vi.fn();
const init = vi.fn(async () => {});
vi.mock("@/lib/tg/bot", () => ({
  getBot: () => ({ init, handleUpdate }),
}));

const waitUntilArgs: unknown[] = [];
vi.mock("@vercel/functions", () => ({
  waitUntil: (p: unknown) => { waitUntilArgs.push(p); },
}));

const SECRET = "s3cret";

function post(body: unknown, secret: string | null = SECRET): Request {
  return new Request("https://x/api/tg/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret === null ? {} : { "x-telegram-bot-api-secret-token": secret }),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", SECRET);
  handleUpdate.mockReset();
  init.mockClear();
  waitUntilArgs.length = 0;
});

describe("TG webhook：先 ACK 后处理", () => {
  it("handleUpdate 还没 resolve，POST 就已经返回 200（防 Telegram 超时重投）", async () => {
    // handleUpdate 永不 resolve —— 旧实现（await 整个 handler）在这里会**挂住**，
    // 新实现必须照常返回。这就是本条的判别力所在。
    let release: (() => void) | undefined;
    handleUpdate.mockImplementation(() => new Promise<void>((r) => { release = () => r(); }));

    const { POST } = await import("../route");
    const res = await Promise.race([
      POST(post({ update_id: 1, message: { text: "/today" } })),
      new Promise<"TIMED_OUT">((r) => setTimeout(() => r("TIMED_OUT"), 300)),
    ]);

    expect(res).not.toBe("TIMED_OUT");
    expect((res as Response).status).toBe(200);
    // 而且处理确实被交出去继续跑了，不是被丢掉
    expect(handleUpdate).toHaveBeenCalledTimes(1);
    expect(waitUntilArgs).toHaveLength(1);
    release?.();
  });

  it("handleUpdate 抛错不会让响应变成非 2xx（否则 Telegram 又会重投）", async () => {
    handleUpdate.mockRejectedValue(new Error("LLM 挂了"));
    const { POST } = await import("../route");
    const res = await POST(post({ update_id: 2, message: { text: "/today" } }));
    expect(res.status).toBe(200);
    // 交给 waitUntil 的那个 promise 必须自己吞掉异常，不能变成 unhandled rejection
    await expect(waitUntilArgs[0] as Promise<void>).resolves.toBeUndefined();
  });

  it("secret 不匹配 → 403，且绝不处理 update", async () => {
    const { POST } = await import("../route");
    const res = await POST(post({ update_id: 3 }, "wrong"));
    expect(res.status).toBe(403);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it("缺 secret 头 → 403", async () => {
    const { POST } = await import("../route");
    expect((await POST(post({ update_id: 4 }, null))).status).toBe(403);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it("body 不是合法 JSON → 400，且不处理", async () => {
    const { POST } = await import("../route");
    const bad = new Request("https://x/api/tg/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": SECRET },
      body: "{ not json",
    });
    expect((await POST(bad)).status).toBe(400);
    expect(handleUpdate).not.toHaveBeenCalled();
  });

  it("并发请求只 init 一次（不重复打 getMe）", async () => {
    handleUpdate.mockResolvedValue(undefined);
    const { POST } = await import("../route");
    await Promise.all([
      POST(post({ update_id: 5 })),
      POST(post({ update_id: 6 })),
      POST(post({ update_id: 7 })),
    ]);
    expect(init).toHaveBeenCalledTimes(1);
    expect(handleUpdate).toHaveBeenCalledTimes(3);
  });
});
