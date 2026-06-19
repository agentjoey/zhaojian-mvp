import { describe, it, expect } from "vitest";
import { computeUnifiedChart, BirthInputSchema } from "../src/index";
import { deriveWesternProfile, MOON_PHASES } from "../src/western/profile";

const w = computeUnifiedChart(
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
).western!;

describe("EP-505 西方增强 deriveWesternProfile", () => {
  const p = deriveWesternProfile(w);

  it("元素/模式平衡计数之和 = 行星数", () => {
    const { fire, earth, air, water } = p.elementBalance;
    expect(fire + earth + air + water).toBe(w.planets.length);
    const { cardinal, fixed, mutable } = p.modalityBalance;
    expect(cardinal + fixed + mutable).toBe(w.planets.length);
  });

  it("命主星解析成功（守护星 + 落点）", () => {
    expect(p.chartRuler.planet).toBeTruthy();
    expect(p.chartRuler.placement).toMatch(/\S/);
  });

  it("月相为已知相位之一", () => {
    expect(MOON_PHASES).toContain(p.moonPhase);
  });

  it("patterns 为数组（星群检测）", () => {
    expect(Array.isArray(p.patterns)).toBe(true);
  });
});
