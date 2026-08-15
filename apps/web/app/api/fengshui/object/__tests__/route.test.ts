// @vitest-environment node
//
// 与 apps/web/app/api/fengshui/reading/__tests__/route.test.ts 同一套约定：路由处理函数
// 跑在 Node runtime，直接用原生 Request/Response 调 POST，不经过 Next 开发/构建服务器。
// `@eamvp/llm` 整体 mock 掉（避免真实网络调用）；本路由只做「接收已算好的 ObjectAdvice →
// 调 adviseObjectText 润色 → 原样吐出文本」，不涉及 @eamvp/core 的排盘计算，因此无需像
// reading route 的测试那样保留真实 core 调用。
//
// 覆盖四条路径（与 reading route 对齐）：LLM 未配置 503、入参非法 400、正常路径 200、
// 生成抛错 500；外加 x-zj-locale 透传验证。
import { describe, it, expect, vi, beforeEach } from "vitest";

const isLlmConfiguredMock = vi.fn<(...args: unknown[]) => boolean>(() => true);
const adviseObjectTextMock = vi.fn<(...args: unknown[]) => Promise<string>>();

vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "anthropic", wire: "anthropic", model: "m", baseUrl: "http://x", apiKey: "k" })),
  isLlmConfigured: (...a: unknown[]) => isLlmConfiguredMock(...a),
  adviseObjectText: (...a: unknown[]) => adviseObjectTextMock(...a),
}));

const { POST } = await import("../route");

/** 一份形状合法的 ObjectAdvice（字段与 packages/core/src/fengshui/object-advisor.ts 的类型对齐）。 */
const VALID_ADVICE = {
  category: "desk",
  categoryLabel: "书桌",
  elementOfObject: "木",
  recommendedDirections: [{ direction: "E", label: "东", reason: "生气方" }],
  avoid: [{ direction: "W", label: "西", reason: "五鬼方，久待或重器不宜" }],
  categoryRules: ["坐位背靠实墙，不背对门与通道", "桌面留出可见的空白区"],
  personalFit: "物件五行为木，正是你命局喜用，可放心多用。",
  intendedVerdict: null,
};

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/fengshui/object", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  isLlmConfiguredMock.mockReset().mockReturnValue(true);
  adviseObjectTextMock.mockReset();
});

describe("POST /api/fengshui/object", () => {
  it("LLM 未配置时返回 503，不调用 adviseObjectText", async () => {
    isLlmConfiguredMock.mockReturnValue(false);
    const res = await POST(req(VALID_ADVICE));
    expect(res.status).toBe(503);
    expect(adviseObjectTextMock).not.toHaveBeenCalled();
  });

  it("入参缺少必需字段时返回 400，不调用 adviseObjectText", async () => {
    const res = await POST(req({ foo: "bar" }));
    expect(res.status).toBe(400);
    expect(adviseObjectTextMock).not.toHaveBeenCalled();
  });

  it("category 不在枚举内时返回 400", async () => {
    const res = await POST(req({ ...VALID_ADVICE, category: "not-a-real-category" }));
    expect(res.status).toBe(400);
    expect(adviseObjectTextMock).not.toHaveBeenCalled();
  });

  it("正常路径：返回 200 与润色文本原文", async () => {
    adviseObjectTextMock.mockResolvedValue("放东边靠墙就好。");
    const res = await POST(req(VALID_ADVICE));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("放东边靠墙就好。");
  });

  it("adviseObjectText 抛错时返回 500", async () => {
    adviseObjectTextMock.mockRejectedValue(new Error("上游超时"));
    const res = await POST(req(VALID_ADVICE));
    expect(res.status).toBe(500);
  });

  it("请求体原样、x-zj-locale 头会被透传给 adviseObjectText 的 language", async () => {
    adviseObjectTextMock.mockResolvedValue("ok");
    await POST(req(VALID_ADVICE, { "x-zj-locale": "en" }));
    expect(adviseObjectTextMock).toHaveBeenCalledTimes(1);
    const [advice, opts] = adviseObjectTextMock.mock.calls[0]!;
    expect(advice).toEqual(VALID_ADVICE);
    expect(opts).toMatchObject({ language: "en" });
  });

  it("未指定 x-zj-locale 头时默认按 zh 透传（与 localeFromRequest 的默认值一致）", async () => {
    adviseObjectTextMock.mockResolvedValue("ok");
    await POST(req(VALID_ADVICE));
    const [, opts] = adviseObjectTextMock.mock.calls[0]!;
    expect(opts).toMatchObject({ language: "zh" });
  });
});
