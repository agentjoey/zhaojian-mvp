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
