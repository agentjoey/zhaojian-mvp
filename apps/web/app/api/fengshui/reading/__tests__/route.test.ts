// @vitest-environment node
//
// 路由处理函数在真实生产环境下跑在 Node.js runtime（route.ts 顶部
// `export const runtime = "nodejs"`），用标准 Fetch API 的 `Request`/`Response`。
// 这里用 `@vitest-environment node` 覆盖本文件的测试环境（其余测试仍走仓库默认的
// jsdom），直接拿 Node 原生 Request/Response 构造请求、调用 POST 处理函数——不经过
// Next 的开发/构建服务器，是最贴近路由处理函数真实运行时形态的单测方式。
//
// Task 14 复审必修2：本路由此前零测试。覆盖四条路径：LLM 未配置 503、入参非法 400、
// 正常路径返回 JSON（含 sections/degraded）、生成抛错 500。`@eamvp/llm` 整体 mock 掉，
// 避免真实网络调用；`@eamvp/core` 不 mock，让 computeUnifiedChart/computeFengshui
// 走真实计算（快、确定性，且能顺带验证 route 与 core 的接线没有断）。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BirthInputSchema, type FengshuiChart } from "@eamvp/core";

const isLlmConfiguredMock = vi.fn<(...args: unknown[]) => boolean>(() => true);
const generateFengshuiReadingMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "anthropic", wire: "anthropic", model: "m", baseUrl: "http://x", apiKey: "k" })),
  isLlmConfigured: (...a: unknown[]) => isLlmConfiguredMock(...a),
  generateFengshuiReading: (...a: unknown[]) => generateFengshuiReadingMock(...a),
}));

const { POST } = await import("../route");

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });

const VALID_READING = {
  markdown: "## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n",
  sections: { situation: "甲", youAndSpace: "乙", actions: "- 丙" },
  corrections: [],
  degraded: false,
};

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/fengshui/reading", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  isLlmConfiguredMock.mockReset().mockReturnValue(true);
  generateFengshuiReadingMock.mockReset();
});

describe("POST /api/fengshui/reading", () => {
  it("LLM 未配置时返回 503，不调用 generateFengshuiReading", async () => {
    isLlmConfiguredMock.mockReturnValue(false);
    const res = await POST(req(birth));
    expect(res.status).toBe(503);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
  });

  it("入参非法时返回 400", async () => {
    const res = await POST(req({ date: "not-a-date" }));
    expect(res.status).toBe(400);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
  });

  it("正常路径：返回 JSON，body 含 sections 与 degraded", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    const res = await POST(req(birth));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const data = await res.json();
    expect(data.sections).toEqual(VALID_READING.sections);
    expect(data.degraded).toBe(false);
  });

  it("degraded 为 true 时 JSON body 如实反映（不再靠响应头传递）", async () => {
    generateFengshuiReadingMock.mockResolvedValue({
      ...VALID_READING,
      corrections: [{ direction: "E", claimed: "五鬼", actual: "生气" }],
      degraded: true,
    });
    const res = await POST(req(birth));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.degraded).toBe(true);
    // 自定义响应头 X-Fengshui-Degraded 已删除——降级信号只应存在于 JSON body 里，
    // 不再有「host 头 + body 两处字面量、改一处就断链」的问题。
    expect(res.headers.has("X-Fengshui-Degraded")).toBe(false);
  });

  it("generateFengshuiReading 抛错时返回 500", async () => {
    generateFengshuiReadingMock.mockRejectedValue(new Error("上游超时"));
    const res = await POST(req(birth));
    expect(res.status).toBe(500);
  });

  it("请求体里的 nickname / x-zj-locale 头会被透传给 generateFengshuiReading", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    await POST(req({ ...birth, nickname: "小明" }, { "x-zj-locale": "en" }));
    expect(generateFengshuiReadingMock).toHaveBeenCalledTimes(1);
    const [, opts] = generateFengshuiReadingMock.mock.calls[0]!;
    expect(opts).toMatchObject({ language: "en", nickname: "小明" });
  });
});

/**
 * Task 9（EP-fs-15）：请求体可选带 dwelling/cohabitants，服务端据此重新
 * computeFengshui（真实实现，未 mock）算出 Layer 1 盘，再交给 generateFengshuiReading
 * （仍 mock，避免真实网络调用）。这里断言的是"接线正确"——服务端确实把居所与合看
 * 成员用于计算，而不是收下就丢；不是重新验证 computeFengshui/dwellingGua 本身的
 * 领域逻辑（那些已由 fengshui-dwelling.test.ts / fengshui-compute.test.ts 覆盖）。
 */
describe("POST /api/fengshui/reading — Layer 1 居所与合看（Task 9/EP-fs-15）", () => {
  it("请求体带 dwelling 与 cohabitants 时，服务端重新计算出 Layer 1 FengshuiChart 并传给 generateFengshuiReading", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    // 1984-06-15 男 = 兑7（西四命），与主档案 1990-06-15 男 = 坎1（东四命）刻意异组，
    // 用来确认 cohabitants 是"各自独立算出命卦"而不是错误地复用了主档案的命卦。
    const cohabBirth = BirthInputSchema.parse({ date: "1984-06-15", time: "10:00", gender: "male", trueSolarTime: false });

    await POST(req({
      ...birth,
      dwelling: { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S" },
      cohabitants: [{ profileId: "p2", name: "阿乙", birth: cohabBirth }],
    }));

    expect(generateFengshuiReadingMock).toHaveBeenCalledTimes(1);
    const fsArg = generateFengshuiReadingMock.mock.calls[0]![0] as FengshuiChart;
    expect(fsArg.layer).toBe(1);
    if (fsArg.layer !== 1) throw new Error("unreachable");
    // 向南 → 坐北 → 坎宅
    expect(fsArg.dwelling).toMatchObject({ guaName: "坎", facing: "S" });
    expect(fsArg.cohabitants).toHaveLength(1);
    expect(fsArg.cohabitants[0]).toMatchObject({ profileId: "p2", name: "阿乙" });
    expect(fsArg.cohabitants[0]!.mingGua.guaName).toBe("兑");
  });

  it("不带 dwelling/cohabitants 时仍是 Layer 0（向后兼容波1 的调用方式：body 就是 BirthInput 本身）", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    await POST(req(birth));
    const fsArg = generateFengshuiReadingMock.mock.calls[0]![0] as FengshuiChart;
    expect(fsArg.layer).toBe(0);
    expect(fsArg.dwelling).toBeUndefined();
    expect(fsArg.cohabitants).toBeUndefined();
  });

  it("dwelling.facing 非法枚举值时返回 400（不会把半成品塞给 computeFengshui）", async () => {
    const res = await POST(req({ ...birth, dwelling: { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "NNE" } }));
    expect(res.status).toBe(400);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
  });
});
