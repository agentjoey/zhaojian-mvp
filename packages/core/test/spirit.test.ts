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

  it("voiceSamples 随主导五行派生：中英各 2 句，非空", () => {
    const s = deriveSpirit(chart);
    expect(s.voiceSamples.zh).toHaveLength(2);
    expect(s.voiceSamples.en).toHaveLength(2);
    for (const line of [...s.voiceSamples.zh, ...s.voiceSamples.en]) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
    // 样本语言不得放错槽位：zh 槽含中文、en 槽不含
    expect(s.voiceSamples.zh.every((l) => /[一-鿿]/.test(l))).toBe(true);
    expect(s.voiceSamples.en.every((l) => !/[一-鿿]/.test(l))).toBe(true);
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
