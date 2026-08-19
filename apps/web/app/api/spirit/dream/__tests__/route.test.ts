// @vitest-environment node
//
// 测法同 app/api/tg/fengshui/__tests__/route.test.ts：直接 import 路由处理函数、
// 拿 Node 原生 Request 调用，不经过 Next 的开发/构建服务器。
//
// EP-dream-02：web 无状态解梦端点的 flag 门控（404）、入参校验（400）、LLM 未配置
// （503）、Bearer 用户额度闸门（402）、生成失败（500）都在本文件覆盖。无 Bearer 的
// 匿名调用不收额度——consumeLlm 必须零调用。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getUserMock = vi.fn(async (_token?: string) => ({
  data: { user: { id: "u1" } },
}));
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (t: string) => getUserMock(t) } }),
}));
const consumeLlmMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/entitlements", () => ({
  consumeLlm: (...a: unknown[]) => consumeLlmMock(...a),
}));
vi.mock("@/lib/i18n/server", () => ({ localeFromRequest: () => "zh" }));
const isLlmConfiguredMock = vi.fn(() => true);
const interpretDreamSpy = vi.fn(async function* () {
  yield "解读";
});
vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "minimax", model: "m" })),
  isLlmConfigured: () => isLlmConfiguredMock(),
  interpretDream: (...a: unknown[]) => interpretDreamSpy(...(a as [])),
  DREAM_MAX_CHARS: 2000,
}));

const { POST } = await import("../route");

const CHART = { fake: true };

function req(body: unknown, token?: string) {
  return new Request("http://x/api/spirit/dream", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/spirit/dream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("正常解读（匿名，无 Bearer）：200 + 文本；memory/questionnaire 透传；不收额度", async () => {
    const res = await POST(
      req({ chart: CHART, dream: "我梦见坠落", memory: "旧记忆", questionnaire: "问卷" }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("解读");
    expect(interpretDreamSpy).toHaveBeenCalledWith(
      CHART,
      "我梦见坠落",
      expect.objectContaining({ language: "zh", memory: "旧记忆", questionnaire: "问卷" }),
    );
    expect(consumeLlmMock).not.toHaveBeenCalled();
  });

  it("缺 chart → 400；缺 dream → 400；超长 → 400；均不调 LLM", async () => {
    expect((await POST(req({ dream: "我梦见坠落" }))).status).toBe(400);
    expect((await POST(req({ chart: CHART }))).status).toBe(400);
    expect((await POST(req({ chart: CHART, dream: "x".repeat(2001) }))).status).toBe(400);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("LLM 未配置 → 503，不调 LLM", async () => {
    isLlmConfiguredMock.mockReturnValueOnce(false);
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }));
    expect(res.status).toBe(503);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("Bearer 用户超额度 → 402，不调 LLM；闸门查的是 token 解出的 uid", async () => {
    consumeLlmMock.mockResolvedValueOnce({ ok: false });
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }, "tok"));
    expect(res.status).toBe(402);
    expect(getUserMock).toHaveBeenCalledWith("tok");
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("Bearer 用户额度充足 → 200", async () => {
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }, "tok"));
    expect(res.status).toBe(200);
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
  });

  it("flag 关闭（NEXT_PUBLIC_DREAM_ENABLED≠1）→ 404", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "0");
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }));
    expect(res.status).toBe(404);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("生成抛错 → 500", async () => {
    interpretDreamSpy.mockImplementationOnce(async function* () {
      throw new Error("llm down");
    });
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }));
    expect(res.status).toBe(500);
  });
});
