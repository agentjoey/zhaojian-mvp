import { describe, it, expect } from "vitest";
import { computeBaziChart, BirthInputSchema } from "../src/index";
import { deriveStrength } from "../src/bazi/strength";
import type { BirthInput } from "../src/index";

const mk = (over: Partial<BirthInput>): BirthInput =>
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

describe("EP-502 旺衰证据化 deriveStrength", () => {
  // 1991-03-15 14:30 → 辛未 辛卯 甲申 辛未，日主甲木：得令(卯月)但三辛金克、通根浅 → 身弱
  it("甲木案例判 weak 且证据自洽", () => {
    const c = computeBaziChart(mk({}));
    const e = deriveStrength(c);
    expect(c.dayMaster).toBe("甲");
    expect(e.verdict).toBe("weak");
    expect(e.异党).toBeGreaterThan(e.同党); // 官杀重
    expect(e.ratio).toBeLessThan(0.4);
  });

  it("得令：甲生卯月 → 得令为真", () => {
    expect(deriveStrength(computeBaziChart(mk({}))).得令).toBe(true);
  });

  it("通根：卯中乙木为比劫根", () => {
    const roots = deriveStrength(computeBaziChart(mk({}))).roots;
    expect(roots.some((r) => r.branch === "卯" && r.via === "比劫")).toBe(true);
  });

  it("ratio 在 [0,1] 且 verdict 为三档之一", () => {
    const e = deriveStrength(computeBaziChart(mk({})));
    expect(e.ratio).toBeGreaterThanOrEqual(0);
    expect(e.ratio).toBeLessThanOrEqual(1);
    expect(["strong", "weak", "balanced"]).toContain(e.verdict);
  });
});
