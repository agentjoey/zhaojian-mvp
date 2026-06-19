import { describe, it, expect } from "vitest";
import { computeUnifiedChart, computeDailyFortune, BirthInputSchema } from "../src/index";
import { branchRelation } from "../src/daily/index";

describe("EP-504 地支关系 branchRelation", () => {
  it("六冲/六合/三合/刑/害/无 判定正确", () => {
    expect(branchRelation("子", "午")).toBe("冲");
    expect(branchRelation("子", "丑")).toBe("合");
    expect(branchRelation("子", "辰")).toBe("三合"); // 申子辰
    expect(branchRelation("子", "卯")).toBe("刑");
    expect(branchRelation("子", "未")).toBe("害");
    expect(branchRelation("子", "寅")).toBe(null);
  });
});

describe("EP-504 每日 流日×本命 互动 + 用神（千人千日）", () => {
  const chart = computeUnifiedChart(
    BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
  );

  it("DailyFortune 含 interactions(数组) 与 favorableToday(布尔)", () => {
    const f = computeDailyFortune(chart, "2026-06-22");
    expect(Array.isArray(f.interactions)).toBe(true);
    expect(typeof f.favorableToday).toBe("boolean");
    for (const it of f.interactions) {
      expect(["冲", "合", "三合", "刑", "害"]).toContain(it.kind);
      expect(["年", "月", "日", "时"]).toContain(it.withPillar);
    }
  });

  it("favorableToday 与当日五行是否命主喜用一致", () => {
    const f = computeDailyFortune(chart, "2026-06-22");
    // 喜用为木水（甲木身弱）；当日五行属喜用则 favorableToday=true
    const favorable = ["木", "水"].includes(f.dayElement);
    expect(f.favorableToday).toBe(favorable);
  });
});
