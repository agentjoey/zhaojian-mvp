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
//
// 验收补做：记忆提炼是持久化排除项里的例外（只存 summarizeSpiritMemory 的摘要，
// 梦原文仍不落库），fire-and-forget 不阻塞响应——断言前须 flush 微任务队列。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const appendMessage = vi.fn();
const saveMemory = vi.fn();
const appendDreamHistoryMock = vi.fn();
const listDreamHistoryMock = vi.fn(async (..._a: unknown[]) => [{ id: "h1", summary: "一个关于坠落的梦", createdAt: "2026-08-20T00:00:00Z" }]);
const readSessionMock = vi.fn(async (v?: unknown): Promise<{ uid: string; tgId: number } | null> =>
  v === "ok" ? { uid: "u1", tgId: 123 } : null,
);
const getProfileMock = vi.fn(
  async (..._a: unknown[]): Promise<{ id: string; chart: { fake: boolean } } | null> => ({
    id: "p1",
    chart: { fake: true },
  }),
);
const consumeQuotaMock = vi.fn(async (..._a: unknown[]) => true);
const consumeLlmMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }));

vi.mock("@/lib/tg/data", () => ({
  appendMessage,
  getMemory: vi.fn(async () => "旧记忆"),
  getQuestionnaire: vi.fn(async () => null),
  saveMemory: (...a: unknown[]) => saveMemory(...a),
  listMessages: vi.fn(async () => []),
  appendDreamHistory: (...a: unknown[]) => appendDreamHistoryMock(...a),
  listDreamHistory: (...a: unknown[]) => listDreamHistoryMock(...a),
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
const summarizeSpiritMemorySpy = vi.fn(async () => "摘要：最近常梦见坠落，反映对失控的焦虑。");
const continueDreamReplySpy = vi.fn(async (..._a: unknown[]) => ({ text: "追问的解读", stripped: [] }));
const summarizeDreamEntrySpy = vi.fn(async (..._a: unknown[]) => "一个关于坠落的梦");
vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "minimax", model: "m" })),
  isLlmConfigured: () => isLlmConfiguredMock(),
  interpretDream: (...a: unknown[]) => interpretDreamSpy(...(a as [])),
  continueDreamReply: (...a: unknown[]) => continueDreamReplySpy(...(a as [])),
  summarizeSpiritMemory: (...a: unknown[]) => summarizeSpiritMemorySpy(...(a as [])),
  summarizeDreamEntry: (...a: unknown[]) => summarizeDreamEntrySpy(...(a as [])),
  DREAM_MAX_CHARS: 2000,
}));

/** fire-and-forget 记忆更新在 POST() resolve 后才落地——flush 几轮微任务队列。 */
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

// cookies() mock：next/headers（会话 cookie 恒为 "ok"，readSession 据此放行）
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "ok" }) }),
}));

const { POST, GET } = await import("../route");

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

  it("解读成功后 fire-and-forget 提炼记忆：summarizeSpiritMemory 收到梦+回复、旧记忆做 prior，摘要写回 saveMemory（梦原文本身不落库）", async () => {
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(200);
    await flushMicrotasks();

    expect(summarizeSpiritMemorySpy).toHaveBeenCalledWith(
      [
        { role: "user", content: "我梦见坠落" },
        { role: "spirit", content: "解读" },
      ],
      "旧记忆",
      expect.objectContaining({ language: "zh" }),
    );
    expect(saveMemory).toHaveBeenCalledWith("p1", "摘要：最近常梦见坠落，反映对失控的焦虑。");
    // 落库的是摘要，不是梦原文——反向锁定
    expect(saveMemory.mock.calls[0]![1]).not.toContain("我梦见坠落");
  });

  it("summarizeSpiritMemory 返回空/抛错都不影响已成功返回的响应（fire-and-forget 失败静默吞掉）", async () => {
    summarizeSpiritMemorySpy.mockResolvedValueOnce("");
    let res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(200);
    await flushMicrotasks();
    expect(saveMemory).not.toHaveBeenCalled();

    summarizeSpiritMemorySpy.mockRejectedValueOnce(new Error("LLM 挂了"));
    res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("解读");
    await flushMicrotasks();
    expect(saveMemory).not.toHaveBeenCalled();
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

describe("EP-dream-history：TG 臂追问 + 历史摘要", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("首次解读成功后 fire-and-forget 写一条历史摘要（summarizeDreamEntry → appendDreamHistory）", async () => {
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(200);
    await flushMicrotasks();
    expect(summarizeDreamEntrySpy).toHaveBeenCalledWith("我梦见坠落", "解读", expect.objectContaining({ language: "zh" }));
    expect(appendDreamHistoryMock).toHaveBeenCalledWith("p1", "一个关于坠落的梦");
  });

  it("摘要为空/抛错都不影响已返回的响应，也不调用 appendDreamHistory", async () => {
    summarizeDreamEntrySpy.mockResolvedValueOnce("");
    let res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(200);
    await flushMicrotasks();
    expect(appendDreamHistoryMock).not.toHaveBeenCalled();

    summarizeDreamEntrySpy.mockRejectedValueOnce(new Error("LLM 挂了"));
    res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(200);
    await flushMicrotasks();
    expect(appendDreamHistoryMock).not.toHaveBeenCalled();
  });

  it("带 followUp → 走 continueDreamReply（不走 interpretDream），且不重复写历史摘要", async () => {
    const priorTurns = [{ role: "spirit", content: "这个梦在处理坠落感。" }];
    const res = await POST(req({ dream: "我梦见坠落", followUp: "还有别的解读吗？", priorTurns }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("追问的解读");
    expect(interpretDreamSpy).not.toHaveBeenCalled();
    expect(continueDreamReplySpy).toHaveBeenCalledWith(
      { fake: true },
      "我梦见坠落",
      priorTurns,
      "还有别的解读吗？",
      expect.objectContaining({ language: "zh" }),
    );
    await flushMicrotasks();
    expect(summarizeDreamEntrySpy).not.toHaveBeenCalled();
    expect(appendDreamHistoryMock).not.toHaveBeenCalled();
  });

  it("followUp 超长 → 400，不调用任何生成函数", async () => {
    const res = await POST(req({ dream: "我梦见坠落", followUp: "x".repeat(2001) }));
    expect(res.status).toBe(400);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
    expect(continueDreamReplySpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/tg/dream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("已登录 + 有档案 → 200 + 最近历史摘要列表", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.history).toEqual([{ id: "h1", summary: "一个关于坠落的梦", createdAt: "2026-08-20T00:00:00Z" }]);
    expect(listDreamHistoryMock).toHaveBeenCalledWith("p1");
  });

  it("未登录 → 401", async () => {
    readSessionMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("flag 关闭 → 404", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "0");
    const res = await GET();
    expect(res.status).toBe(404);
  });
});
