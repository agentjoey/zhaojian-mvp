import { describe, it, expect } from "vitest";
import { isWesternValid } from "../src/western/index";
import { computeUnifiedChart, BirthInputSchema } from "../src/index";
import type { WesternChart } from "../src/types/chart";

const base: WesternChart = {
  houseSystem: "whole-sign",
  zodiac: "tropical",
  ascendant: { sign: "Leo", degree: 5 },
  midheaven: { sign: "Taurus", degree: 1 },
  planets: [{ name: "Sun", sign: "Pisces", house: 8, degree: 24, retrograde: false }],
  aspects: [],
};

describe("EP-513 西方数据质量校验 isWesternValid", () => {
  it("行星 sign 为空 → 无效", () => {
    expect(isWesternValid({ ...base, planets: [{ ...base.planets[0]!, sign: "" }] })).toBe(false);
  });
  it("上升 sign 为空 → 无效", () => {
    expect(isWesternValid({ ...base, ascendant: { sign: "", degree: 0 } })).toBe(false);
  });
  it("完整盘 → 有效", () => {
    expect(isWesternValid(base)).toBe(true);
  });
  it("真实计算盘通过校验（不误杀）", () => {
    const w = computeUnifiedChart(
      BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
    ).western!;
    expect(isWesternValid(w)).toBe(true);
  });
});
