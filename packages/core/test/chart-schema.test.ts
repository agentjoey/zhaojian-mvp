import { describe, it, expect } from "vitest";
import {
  BirthInputSchema,
  computeUnifiedChart,
  computeBaziChart,
} from "../src/index";
import type { BirthInput } from "../src/index";

describe("BirthInputSchema", () => {
  it("接受出生信息并填充默认值", () => {
    const parsed = BirthInputSchema.parse({
      date: "1991-03-15",
      time: "14:30",
      gender: "male",
      longitude: 121.47,
      latitude: 31.23,
    });
    expect(parsed.timezone).toBe("Asia/Shanghai");
    expect(parsed.trueSolarTime).toBe(true);
    expect(parsed.ziHourConvention).toBe("current");
  });

  it("允许时辰未知（time=null）", () => {
    const parsed = BirthInputSchema.parse({ date: "1991-03-15", time: null, gender: "female" });
    expect(parsed.time).toBeNull();
  });

  it("拒绝非法日期格式", () => {
    expect(() => BirthInputSchema.parse({ date: "1991/3/15", time: "14:30", gender: "male" })).toThrow();
  });
});

describe("computeUnifiedChart — 端到端三引擎", () => {
  const input: BirthInput = BirthInputSchema.parse({
    date: "1991-03-15",
    time: "14:30",
    gender: "male",
    longitude: 121.47,
    latitude: 31.23,
    timezone: "Asia/Shanghai",
  });
  const chart = computeUnifiedChart(input);

  it("八字：年柱/日主稳定（辛未年，日主甲木）", () => {
    expect(chart.bazi.pillars.year.stem).toBe("辛");
    expect(chart.bazi.pillars.year.branch).toBe("未");
    expect(chart.bazi.dayMaster).toBe("甲");
    expect(chart.bazi.dayMasterElement).toBe("木");
    expect(chart.bazi.pillars.hour).not.toBeNull();
  });

  it("八字：五行计数合计 = 8（含时柱）", () => {
    const total = Object.values(chart.bazi.fiveElementCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(8);
  });

  it("八字：大运非空", () => {
    expect(chart.bazi.luckPillars.length).toBeGreaterThan(0);
  });

  it("紫微：12 宫 + 命宫/身宫地支 + 生年四化齐全", () => {
    expect(chart.ziwei.palaces).toHaveLength(12);
    expect(chart.ziwei.soulPalaceBranch).toBeTruthy();
    expect(chart.ziwei.bodyPalaceBranch).toBeTruthy();
    for (const k of ["禄", "权", "科", "忌"] as const) {
      expect(chart.ziwei.birthMutagens[k]).toBeTruthy();
    }
  });

  it("西方盘：十星齐全 + 太阳在双鱼 + 上升有星座", () => {
    expect(chart.western).not.toBeNull();
    expect(chart.western!.planets).toHaveLength(10);
    expect(chart.western!.planets.find((p) => p.name.toLowerCase() === "sun")?.sign).toBe("Pisces");
    expect(chart.western!.ascendant.sign).toBeTruthy();
    expect(chart.western!.aspects.every((a) => ["hard", "soft", "neutral"].includes(a.quality))).toBe(true);
  });

  it("可审计：归一时刻含真太阳时校正标注", () => {
    expect(chart.normalizedSolarTime).toContain("真太阳时校正");
  });
});

describe("降级：时辰未知 → western=null + 无时柱", () => {
  const chart = computeUnifiedChart(
    BirthInputSchema.parse({ date: "1991-03-15", time: null, gender: "female", latitude: 31.23, longitude: 121.47 }),
  );
  it("western 为 null", () => expect(chart.western).toBeNull());
  it("八字时柱为 null，五行计 6", () => {
    expect(chart.bazi.pillars.hour).toBeNull();
    const total = Object.values(chart.bazi.fiveElementCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(6);
  });
  it("紫微仍出 12 宫", () => expect(chart.ziwei.palaces).toHaveLength(12));
});

describe("边界：立春年柱切换（八字以立春为岁首）", () => {
  const mk = (date: string): BirthInput =>
    BirthInputSchema.parse({ date, time: "12:00", gender: "male", trueSolarTime: false });
  it("立春前(2024-02-01)= 癸卯年；立春后(2024-03-01)= 甲辰年", () => {
    expect(computeBaziChart(mk("2024-02-01")).pillars.year.stem + computeBaziChart(mk("2024-02-01")).pillars.year.branch).toBe("癸卯");
    expect(computeBaziChart(mk("2024-03-01")).pillars.year.stem + computeBaziChart(mk("2024-03-01")).pillars.year.branch).toBe("甲辰");
  });
});

describe("边界：早晚子时日柱（23:30 vs 次日 00:30 应同属一日柱区间附近，不报错）", () => {
  const mk = (date: string, time: string): BirthInput =>
    BirthInputSchema.parse({ date, time, gender: "male", trueSolarTime: false });
  it("23:30 与 00:30 排盘均成功且各自产出日柱", () => {
    const late = computeBaziChart(mk("2024-06-12", "23:30"));
    const early = computeBaziChart(mk("2024-06-13", "00:30"));
    expect(late.pillars.day.stem).toBeTruthy();
    expect(early.pillars.day.stem).toBeTruthy();
    // 金标准断言（子时归日精确约定）留待 EP-002 对照官方计算器后补
  });
});
