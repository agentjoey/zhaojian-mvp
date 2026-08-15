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

describe("最终评审 Blocking 1：三节全部解析为空时视为生成失败，不返回空报告", () => {
  it("模型输出不含合法 H2 标题（### 而非 ##）时抛错——调用方据此走 failed/重试路径，而不是缓存一份三节皆空的报告", async () => {
    chatMock.mockResolvedValue("### 形势\n甲\n\n### 境与你\n乙\n\n### 可做的事\n- 丙\n");
    await expect(generateFengshuiReading(fs, { config: cfg, language: "zh" })).rejects.toThrow();
  });

  it("标题加粗而非 H2（**形势**）同样抛错", async () => {
    chatMock.mockResolvedValue("**形势**\n甲\n\n**境与你**\n乙\n\n**可做的事**\n- 丙\n");
    await expect(generateFengshuiReading(fs, { config: cfg, language: "zh" })).rejects.toThrow();
  });

  it("回归：只要至少一节能解析出内容，就不算失败——只漏了一个 H2 标题（非全部）时仍按容错策略正常返回，缺的那节置空", async () => {
    chatMock.mockResolvedValue("## 形势\n甲\n\n## 境与你\n乙\n");
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.sections.situation).toBe("甲");
    expect(r.sections.youAndSpace).toBe("乙");
    expect(r.sections.actions).toBe("");
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

// ─────────────────────────────────────────────────────────────────────────────
// 最终评审 C1：端到端失败链。Layer 1 下模型**正确**复述房屋八方，此前会被按命卦表
// 「纠正」→ degraded=true → 页面扣下叙述并跳过写缓存 → 每次加载都是一次必然再次
// degraded 的全新 LLM 调用。这里在 generateFengshuiReading 这一层钉住：正确的宅八方
// 叙述必须 degraded=false 且 markdown 不被改写。
// ─────────────────────────────────────────────────────────────────────────────
describe("最终评审 C1：Layer 1 正确的房屋八方叙述不得被判 degraded", () => {
  // 向北 → 坐南 → 离宅；命主 1990 男 = 坎1。离宅东=生气，坎命东=天医。
  const l1 = computeFengshui({
    birth, chart: computeUnifiedChart(birth),
    dwelling: { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "N" },
  });

  it("前置：同一个「东」在两套判语里不同（用例判别力的来源）", () => {
    expect(l1.layer).toBe(1);
    expect(l1.dwelling!.guaName).toBe("离");
    expect(l1.dwelling!.sectors.E.star).toBe("生气");
    expect(l1.personalDirections.E.star).toBe("天医");
  });

  it("模型正确复述宅八方 → corrections 为空、degraded 为 false、markdown 原样", async () => {
    const md = "## 形势\n房屋八方来看，东是生气位。\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n";
    chatMock.mockResolvedValue(md);
    const r = await generateFengshuiReading(l1, { config: cfg, language: "zh" });
    expect(r.corrections).toEqual([]);
    expect(r.degraded).toBe(false);
    expect(r.markdown).toBe(md);
  });

  it("模型说错宅八方 → 仍照常纠正，但纠回的是宅卦表的值", async () => {
    chatMock.mockResolvedValue("## 形势\n房屋八方来看，东是五鬼位。\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n");
    const r = await generateFengshuiReading(l1, { config: cfg, language: "zh" });
    expect(r.degraded).toBe(true);
    expect(r.corrections).toHaveLength(1);
    expect(r.corrections[0]!.correct).toBe("生气");
    expect(r.markdown).toContain("东是生气位");
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
