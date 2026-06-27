import { describe, it, expect } from "vitest";
import {
  computeUnifiedChart,
  BirthInputSchema,
  deriveSelfPortrait,
  PROFILE_QUESTIONNAIRE,
  formatQuestionnaire,
} from "../src/index";

const chart = computeUnifiedChart(
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
);

describe("PROFILE_QUESTIONNAIRE", () => {
  it("3–5 题，每题 id/prompt/options 完整", () => {
    expect(PROFILE_QUESTIONNAIRE.length).toBeGreaterThanOrEqual(3);
    expect(PROFILE_QUESTIONNAIRE.length).toBeLessThanOrEqual(5);
    for (const q of PROFILE_QUESTIONNAIRE) {
      expect(q.id).toBeTruthy();
      expect(q.prompt).toBeTruthy();
      expect(q.options.length).toBeGreaterThanOrEqual(2);
    }
  });
  it("formatQuestionnaire 只渲染已答项", () => {
    const out = formatQuestionnaire({ energy: "solitude", stress: "withdraw" });
    expect(out).toMatch(/Solitude/);
    expect(out).toMatch(/Withdraw|withdraw|think/i);
    expect(out.split("\n").length).toBe(2);
  });
});

describe("deriveSelfPortrait", () => {
  it("5 维，value 落在 1..10，含 dominantElement 与 note", () => {
    const p = deriveSelfPortrait(chart);
    expect(p.dimensions.length).toBe(5);
    for (const d of p.dimensions) {
      expect(d.value).toBeGreaterThanOrEqual(1);
      expect(d.value).toBeLessThanOrEqual(10);
    }
    expect(["wood", "fire", "earth", "metal", "water"]).toContain(p.dominantElement);
    expect(p.note).toBeTruthy();
  });

  it("确定性：同输入同输出", () => {
    expect(deriveSelfPortrait(chart)).toEqual(deriveSelfPortrait(chart));
  });

  it("问卷自陈调制画像（stress=connect 抬升 connection）", () => {
    const base = deriveSelfPortrait(chart);
    const nudged = deriveSelfPortrait(chart, { questionnaire: { stress: "connect" } });
    const bC = base.dimensions.find((d) => d.key === "connection")!.value;
    const nC = nudged.dimensions.find((d) => d.key === "connection")!.value;
    expect(nC).toBeGreaterThanOrEqual(bC);
  });

  it("西方盘缺失仍可派生（纯八字）", () => {
    const p = deriveSelfPortrait({ ...chart, western: null });
    expect(p.dimensions.length).toBe(5);
  });
});
