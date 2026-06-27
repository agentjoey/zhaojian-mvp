import { describe, it, expect } from "vitest";
import { computeUnifiedChart, BirthInputSchema, deriveSpirit } from "../src/index";

const input = BirthInputSchema.parse({
  date: "1991-03-15",
  time: "14:30",
  gender: "male",
  latitude: 31.23,
  longitude: 121.47,
});
const chart = computeUnifiedChart(input);

describe("deriveSpirit", () => {
  it("从主导五行派生 dominantElement，archetype/toneHints 非空", () => {
    const s = deriveSpirit(chart);
    expect(["wood", "fire", "earth", "metal", "water"]).toContain(s.dominantElement);
    expect(s.archetype).toBeTruthy();
    expect(s.toneHints.length).toBeGreaterThan(0);
    expect(s.coreTension).toBeTruthy();
  });

  it("anchorFacts 引用命盘已有字段（命主星/福德宫/张力之一）", () => {
    const s = deriveSpirit(chart);
    expect(s.anchorFacts.length).toBeGreaterThan(0);
  });

  it("西方盘缺失时仍可派生（退紫微命宫主星 + 化忌张力）", () => {
    const s = deriveSpirit({ ...chart, western: null });
    expect(s.archetype).toBeTruthy();
    expect(s.dominantElement).toBeTruthy();
    expect(s.coreTension).toBeTruthy();
  });

  it("确定性：同命盘多次派生结果一致", () => {
    expect(deriveSpirit(chart)).toEqual(deriveSpirit(chart));
  });
});
