// @vitest-environment node
//
// 测法同 app/api/tg/fengshui/__tests__/route.test.ts：直接 import 路由处理函数、
// 拿 Node 原生 Request 调用，不经过 Next 的开发/构建服务器。
//
// EP-dream-02：web 无状态解梦端点的 flag 门控（404）、入参校验（400）、LLM 未配置
// （503）、Bearer 用户额度闸门（402）、生成失败（500）都在本文件覆盖。
// EP-account2-05：无 Bearer 或身份未识别的调用一律 401——原先 `if (userId)`
// 在未带 token 时静默跳过闸门，等于匿名无限免费。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getUserMock = vi.fn(async (_token?: string) => ({
  data: { user: { id: "u1" } },
}));
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (t: string) => getUserMock(t) } }),
}));
const resolveAccessMock = vi.fn(async (..._a: unknown[]): Promise<unknown> => ({ level: "identified", hasVerifiedEmail: false, hasTelegram: true }));
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));
const consumeLlmMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
vi.mock("@/lib/entitlements", () => ({
  consumeLlm: (...a: unknown[]) => consumeLlmMock(...a),
}));
vi.mock("@/lib/i18n/server", () => ({ localeFromRequest: () => "zh" }));
const isLlmConfiguredMock = vi.fn(() => true);
const interpretDreamSpy = vi.fn(async function* () {
  yield "解读";
});
const continueDreamReplySpy = vi.fn(async (..._a: unknown[]) => ({ text: "追问的解读", stripped: [] }));
vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "minimax", model: "m" })),
  isLlmConfigured: () => isLlmConfiguredMock(),
  interpretDream: (...a: unknown[]) => interpretDreamSpy(...(a as [])),
  continueDreamReply: (...a: unknown[]) => continueDreamReplySpy(...(a as [])),
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
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("正常解读（已识别 Bearer 用户）：200 + 文本；memory/questionnaire 透传；收一次额度", async () => {
    const res = await POST(
      req({ chart: CHART, dream: "我梦见坠落", memory: "旧记忆", questionnaire: "问卷" }, "tok"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("解读");
    expect(interpretDreamSpy).toHaveBeenCalledWith(
      CHART,
      "我梦见坠落",
      expect.objectContaining({ language: "zh", memory: "旧记忆", questionnaire: "问卷" }),
    );
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
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
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落" }, "tok"));
    expect(res.status).toBe(500);
  });
});

describe("EP-dream-history 追问：followUp/priorTurns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("带 followUp → 走 continueDreamReply（不走 interpretDream），priorTurns 原样透传且裁到最近 12 条", async () => {
    const priorTurns = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 === 0 ? "spirit" : "user", content: `t${i}` }));
    const res = await POST(
      req({ chart: CHART, dream: "我梦见坠落", followUp: "还有别的解读吗？", priorTurns }, "tok"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("追问的解读");
    expect(interpretDreamSpy).not.toHaveBeenCalled();
    expect(continueDreamReplySpy).toHaveBeenCalledWith(
      CHART,
      "我梦见坠落",
      priorTurns.slice(-12),
      "还有别的解读吗？",
      expect.objectContaining({ language: "zh" }),
    );
  });

  it("followUp 超长 → 400，不调用任何生成函数", async () => {
    const res = await POST(req({ chart: CHART, dream: "我梦见坠落", followUp: "x".repeat(2001) }, "tok"));
    expect(res.status).toBe(400);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
    expect(continueDreamReplySpy).not.toHaveBeenCalled();
  });
});

describe("EP-account2-05：/api/spirit/dream 同一处闸门漏洞", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("无 Authorization → 401，不调用 interpretDream（此前 if(userId) 会静默放行）", async () => {
    const res = await POST(req({ chart: { fake: true }, dream: "我梦见坠落" }));
    expect(res.status).toBe(401);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });

  it("有 Bearer 但 resolveAccess 判定 anonymous → 401", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
    const res = await POST(req({ chart: { fake: true }, dream: "我梦见坠落" }, "tok"));
    expect(res.status).toBe(401);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });
});
