import { describe, it, expect } from "vitest";
import { computeUnifiedChart, BirthInputSchema } from "../src/index";
import { deriveTriad } from "../src/ziwei/triad";

const chart = computeUnifiedChart(
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
);

describe("EP-503 紫微三方四正 deriveTriad", () => {
  it("命宫三方四正 = 命/财帛/官禄/迁移（环位算术正确）", () => {
    const t = deriveTriad(chart.ziwei.palaces, "命");
    // 借自三宫应为 财帛 / 官禄 / 迁移
    const joined = t.borrowedFrom.join(",");
    expect(joined).toContain("财帛");
    expect(joined).toContain("官禄");
    expect(joined).toContain("迁移");
    expect(t.borrowedFrom).toHaveLength(3);
  });

  it("汇集三方四正主星，空宫时仍有借星", () => {
    const t = deriveTriad(chart.ziwei.palaces, "命");
    expect(Array.isArray(t.stars)).toBe(true);
    expect(typeof t.isEmpty).toBe("boolean");
    // 三方四正合计应有主星（极少全空）
    expect(t.stars.length).toBeGreaterThan(0);
  });
});
