import { describe, it, expect, vi, beforeEach } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui, adviseObject } from "@eamvp/core";

const chatMock = vi.fn();
vi.mock("../client", () => ({ chat: (...a: unknown[]) => chatMock(...a) }));

const { generateFengshuiReading, adviseObjectText } = await import("./index");

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });
const objectAdvice = adviseObject(
  { verdicts: fs.personalDirections, affinity: fs.elementAffinity },
  { category: "desk", material: "原木" },
);
const cfg = { provider: "anthropic", wire: "anthropic", model: "m", baseUrl: "http://x", apiKey: "k" } as never;

beforeEach(() => chatMock.mockReset());

/** chatMock 的第一个调用里取出 system/user 两条消息内容，供下面按角色断言。 */
function sentMessages(): { role: string; content: string }[] {
  return chatMock.mock.calls[0]![1] as { role: string; content: string }[];
}

describe("EP-fs-05 generateFengshuiReading", () => {
  it("切出三分节", async () => {
    chatMock.mockResolvedValue("## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n");
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.sections.situation.trim()).toBe("甲");
    expect(r.sections.actions.trim()).toBe("- 丙");
  });

  it("方位说错时自动纠正并记录", async () => {
    const e = fs.personalDirections.E;
    const wrong = e.star === "绝命" ? "五鬼" : "绝命";
    chatMock.mockResolvedValue(`## 形势\n东为${wrong}方。\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n`);
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.corrections.length).toBeGreaterThan(0);
    expect(r.markdown).toContain(`东为${e.star}方`);
  });

  it("伪科学措辞被清除", async () => {
    chatMock.mockResolvedValue("## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 放金属摆件（传统象征）。研究表明有效。\n");
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.markdown).not.toContain("研究表明");
  });

  it("LLM 未配置时抛错（调用方据此走确定性降级）", async () => {
    await expect(generateFengshuiReading(fs, { config: { apiKey: "" } as never })).rejects.toThrow();
  });
});

describe("EP-fs-05 degraded 标记（corrections 非空即代表输出可信度存疑）", () => {
  it("有方位纠正时 degraded 为 true —— 调用方不读 corrections 数组也能识别", async () => {
    const e = fs.personalDirections.E;
    const wrong = e.star === "绝命" ? "五鬼" : "绝命";
    chatMock.mockResolvedValue(`## 形势\n东为${wrong}方。\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n`);
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.corrections.length).toBeGreaterThan(0);
    expect(r.degraded).toBe(true);
  });

  it("无方位纠正时 degraded 为 false", async () => {
    chatMock.mockResolvedValue("## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n");
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.corrections.length).toBe(0);
    expect(r.degraded).toBe(false);
  });
});

// Task 11 复审必修1：adviseObjectText 此前完全不读 opts.language / opts.nickname——
// 传 { language: "en" } 会静默拿到中文输出。下面用 chatMock 截获真实发出的
// system/user 消息，钉住这两个参数确实被接线，而不是只在 prompt.ts 单测层面验证
// builder 本身（builder 对了、没接上调用点，线上照样是原 bug）。
describe("Task11 adviseObjectText — language 与 nickname 真的接线", () => {
  it("language: en 时发给模型的 system prompt 是英文，且不是中文原文+追加一句 answer in English", async () => {
    chatMock.mockResolvedValue("Two calm, actionable sentences.");
    await adviseObjectText(objectAdvice, { config: cfg, language: "en" });
    const sys = sentMessages().find((m) => m.role === "system")!.content;
    expect(sys).not.toContain("自然中文");
    expect(sys).toContain("Only use the directions and rules given");
    expect(sys).toMatch(/write the whole answer in english/i);
  });

  it("不传 language 时默认中文 system prompt（回归：原中文行为不变）", async () => {
    chatMock.mockResolvedValue("两句平实建议。");
    await adviseObjectText(objectAdvice, { config: cfg });
    const sys = sentMessages().find((m) => m.role === "system")!.content;
    expect(sys).toContain("自然中文");
  });

  it("nickname 传入时出现在发给模型的 user prompt 里", async () => {
    chatMock.mockResolvedValue("两句建议。");
    await adviseObjectText(objectAdvice, { config: cfg, nickname: "小明" });
    const user = sentMessages().find((m) => m.role === "user")!.content;
    expect(user).toContain("小明");
  });

  it("LLM 未配置时抛错（调用方据此走确定性降级，不得静默返回空串）", async () => {
    await expect(adviseObjectText(objectAdvice, { config: { apiKey: "" } as never })).rejects.toThrow();
  });
});
