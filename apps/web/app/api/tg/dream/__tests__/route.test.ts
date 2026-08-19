// @vitest-environment node
//
// 测法同 app/api/tg/fengshui/__tests__/route.test.ts：直接 import 路由处理函数、
// 拿 Node 原生 Request 调用，不经过 Next 的开发/构建服务器。本路由照 api/tg/spirit
// 用 next/headers 的 cookies() 取会话，因此这里 mock next/headers。
//
// EP-dream-02：TG 解梦端点的 flag 门控（404）、鉴权（401）、入参校验（400）、
// 双闸（402）、生成失败（500）都在本文件覆盖。最关键的一条：spec §4 明写排除项
// ——梦原文不落库，appendMessage 必须零调用（变异验证：路由里临时加一行
// appendMessage，该断言必须变红）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const appendMessage = vi.fn();
const readSessionMock = vi.fn(async (v?: string) =>
  v === "ok" ? { uid: "u1", tgId: 123 } : null,
);
const getProfileMock = vi.fn(async () => ({ id: "p1", chart: { fake: true } }));
const consumeQuotaMock = vi.fn(async () => true);
const consumeLlmMock = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/tg/data", () => ({
  appendMessage,
  getMemory: vi.fn(async () => "旧记忆"),
  getQuestionnaire: vi.fn(async () => null),
  saveMemory: vi.fn(),
  listMessages: vi.fn(async () => []),
}));
vi.mock("@/lib/tg/session", () => ({
  TG_COOKIE: "zj_tg",
  readSession: (...a: unknown[]) => readSessionMock(...a),
}));
vi.mock("@/lib/tg/identity", () => ({
  getProfileForUser: (...a: unknown[]) => getProfileMock(...a),
}));
vi.mock("@/lib/tg/quota", () => ({
  consumeQuota: (...a: unknown[]) => consumeQuotaMock(...a),
}));
vi.mock("@/lib/entitlements", () => ({
  consumeLlm: (...a: unknown[]) => consumeLlmMock(...a),
}));
vi.mock("@/lib/i18n/server", () => ({ localeFromRequest: () => "zh" }));
const interpretDreamSpy = vi.fn(async function* () {
  yield "解读";
});
const isLlmConfiguredMock = vi.fn(() => true);
vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "minimax", model: "m" })),
  isLlmConfigured: () => isLlmConfiguredMock(),
  interpretDream: (...a: unknown[]) => interpretDreamSpy(...(a as [])),
  DREAM_MAX_CHARS: 2000,
}));

// cookies() mock：next/headers（会话 cookie 恒为 "ok"，readSession 据此放行）
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "ok" }) }),
}));

const { POST } = await import("../route");

function req(body: unknown) {
  return new Request("http://x/api/tg/dream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/tg/dream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("正常解读：200 + 文本；chart 取自服务端档案；且绝不落库（appendMessage 零调用）", async () => {
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("解读");
    // chart 必须来自服务端档案（body 不可信），梦原文随第二参传入
    expect(interpretDreamSpy).toHaveBeenCalledWith(
      { fake: true },
      "我梦见坠落",
      expect.objectContaining({ language: "zh", memory: "旧记忆" }),
    );
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("缺 dream → 400；空白 dream → 400；超长 → 400；均不调 LLM", async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ dream: "   " }))).status).toBe(400);
    expect((await POST(req({ dream: "x".repeat(2001) }))).status).toBe(400);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("未登录（session 无效）→ 401，不调 LLM", async () => {
    readSessionMock.mockResolvedValueOnce(null);
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(401);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("无档案 → 400", async () => {
    getProfileMock.mockResolvedValueOnce(null);
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(400);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("TG 每日额度用尽 → 402，不调 LLM", async () => {
    consumeQuotaMock.mockResolvedValueOnce(false);
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(402);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("LLM 额度闸门拦截 → 402，不调 LLM", async () => {
    consumeLlmMock.mockResolvedValueOnce({ ok: false });
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(402);
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("flag 关闭（NEXT_PUBLIC_DREAM_ENABLED≠1）→ 404", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "0");
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(404);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("LLM 未配置 → 503，且双额度均不被消耗（平台错误不白扣额度）", async () => {
    isLlmConfiguredMock.mockReturnValueOnce(false);
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(503);
    expect(consumeQuotaMock).not.toHaveBeenCalled();
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("生成抛错 → 500", async () => {
    interpretDreamSpy.mockImplementationOnce(async function* () {
      throw new Error("llm down");
    });
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(500);
  });
});
