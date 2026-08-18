import { describe, it, expect } from "vitest";
import { computeUnifiedChart, BirthInputSchema, deriveSpirit, computeDailyFortune } from "@eamvp/core";
import { buildSpiritSystemPrompt, summarizeSpiritMemory } from "./spirit";

const chart = computeUnifiedChart(
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
);

describe("buildSpiritSystemPrompt", () => {
  it("含人格种子 + 第一人称指令 + 守护栏精神", () => {
    const p = deriveSpirit(chart);
    const sys = buildSpiritSystemPrompt(p, chart, "en");
    expect(sys).toContain(p.archetype);
    expect(sys.toLowerCase()).toMatch(/first person|i am|i will|i see/);
    expect(sys).toMatch(/不铁口直断|非预言|算命先生|正面回答/);
  });

  it("只喂 facts，不泄露原始出生坐标", () => {
    const sys = buildSpiritSystemPrompt(deriveSpirit(chart), chart, "en");
    expect(sys).not.toContain("121.47");
    expect(sys).not.toContain("31.23");
  });

  it("西方盘缺失时给出明确降级指令（禁提行星/星座）", () => {
    const noW = { ...chart, western: null };
    const sys = buildSpiritSystemPrompt(deriveSpirit(noW), noW, "en");
    expect(sys).toMatch(/Western chart is NULL|mention NONE/i);
  });

  it("注入 memory / questionnaire 时拼入系统提示", () => {
    const sys = buildSpiritSystemPrompt(deriveSpirit(chart), chart, "en", {
      memory: "MEMORY_MARKER_42",
      questionnaire: "QUESTIONNAIRE_MARKER_7",
    });
    expect(sys).toContain("MEMORY_MARKER_42");
    expect(sys).toContain("QUESTIONNAIRE_MARKER_7");
  });

  it("中文硬规则：短答上限 / 单事实引用 / 默认不问句结尾 / 锚点不重复", () => {
    const sys = buildSpiritSystemPrompt(deriveSpirit(chart), chart, "zh");
    expect(sys).toContain("最多 3 句");
    expect(sys).toContain("120 字");
    expect(sys).toContain("至多引用一处");
    expect(sys).toContain("不以问句结尾");
    expect(sys).toContain("只引用一次");
  });

  it("英文硬规则与中文版对齐（英文是多数访客的默认路径）", () => {
    const sys = buildSpiritSystemPrompt(deriveSpirit(chart), chart, "en");
    expect(sys).toMatch(/at most 3 sentences/i);
    expect(sys).toMatch(/under 80 words/i);
    expect(sys).toMatch(/at most ONE chart fact/i);
    expect(sys).toMatch(/do NOT end with a question/i);
    expect(sys).toMatch(/at most once per conversation/i);
  });

  it("Voice anchors 按语言选样本：zh 给中文样本，en 给英文样本", () => {
    const p = deriveSpirit(chart);
    const sysZh = buildSpiritSystemPrompt(p, chart, "zh");
    const sysEn = buildSpiritSystemPrompt(p, chart, "en");
    expect(sysZh).toContain("Voice anchors");
    for (const s of p.voiceSamples.zh) expect(sysZh).toContain(s);
    for (const s of p.voiceSamples.en) expect(sysEn).toContain(s);
    // 语感锚点必须强调「不复读原句」，否则样本会被当成引用素材
    expect(sysZh).toMatch(/绝不复读原句/);
    expect(sysEn).toMatch(/NEVER recite these lines/i);
  });

  it("禁用清单按语言双版", () => {
    const sysZh = buildSpiritSystemPrompt(deriveSpirit(chart), chart, "zh");
    const sysEn = buildSpiritSystemPrompt(deriveSpirit(chart), chart, "en");
    for (const w of ["首先", "总而言之", "我理解你的感受", "作为你的本命之灵", "值得注意的是"]) {
      expect(sysZh).toContain(w);
    }
    for (const w of ["Firstly", "Moreover", "In conclusion", "I understand how you feel", "As your natal spirit"]) {
      expect(sysEn).toContain(w);
    }
  });
});

describe("summarizeSpiritMemory", () => {
  it("空 history 直接返回 prior（不调用 LLM）", async () => {
    const out = await summarizeSpiritMemory([], "prior-memory-x");
    expect(out).toBe("prior-memory-x");
  });
  it("空 history 无 prior 返回空串", async () => {
    expect(await summarizeSpiritMemory([])).toBe("");
  });
});

describe("computeDailyFortune 喂料形状（每日问今依赖）", () => {
  it("含 dayGanZhi / scores / favorableToday，可作灵问候的确定性事实", () => {
    const d = computeDailyFortune(chart, "2026-06-28");
    expect(d.dayGanZhi).toBeTruthy();
    expect(d.scores).toBeTruthy();
    expect(typeof d.favorableToday).toBe("boolean");
  });
});
