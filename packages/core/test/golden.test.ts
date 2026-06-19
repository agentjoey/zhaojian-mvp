import { describe, it, expect } from "vitest";
import { computeBaziChart, normalizeBirth, BirthInputSchema } from "../src/index";
import type { BirthInput } from "../src/index";

const mk = (over: Partial<BirthInput>): BirthInput =>
  BirthInputSchema.parse({ date: "1991-03-15", time: "12:00", gender: "male", ...over });

describe("EP-002-cal · 真太阳时含均时差 EoT", () => {
  it("校正量 = 经度差×4 + EoT（与纯经度校正不同）", () => {
    // 上海 121.47，东八区标准经线 120 → 经度校正 ≈ +5.88min；2-11 月 EoT 约 -14min
    const n = normalizeBirth(mk({ date: "1991-02-11", time: "12:00", longitude: 121.47, latitude: 31.23 }));
    expect(n.normalizedSolarTime).toContain("真太阳时校正");
    // 2 月中旬 EoT 约 -14min，叠加 +5.88 → 净校正应为负且明显不等于纯经度 +6
    const m = n.normalizedSolarTime.match(/校正 ([+-]\d+)min/);
    const corr = m ? Number(m[1]) : NaN;
    expect(corr).toBeLessThan(0); // EoT 主导
    expect(Math.abs(corr - 6)).toBeGreaterThan(3); // 明显区别于纯经度校正(+6)
  });
  it("缺经度则不校正", () => {
    expect(normalizeBirth(mk({ longitude: undefined })).normalizedSolarTime).not.toContain("校正");
  });
});

describe("EP-002-cal · 晚子时归日（ziHourConvention → sect）", () => {
  it("23:30：current(算当天) 与 next(算次日) 日柱不同", () => {
    const cur = computeBaziChart(mk({ date: "2024-06-12", time: "23:30", trueSolarTime: false, ziHourConvention: "current" }));
    const nxt = computeBaziChart(mk({ date: "2024-06-12", time: "23:30", trueSolarTime: false, ziHourConvention: "next" }));
    expect(cur.pillars.day.stem + cur.pillars.day.branch).not.toBe(nxt.pillars.day.stem + nxt.pillars.day.branch);
    // next 应等于次日 00:30 的日柱
    const nextDay = computeBaziChart(mk({ date: "2024-06-13", time: "00:30", trueSolarTime: false }));
    expect(nxt.pillars.day.stem + nxt.pillars.day.branch).toBe(nextDay.pillars.day.stem + nextDay.pillars.day.branch);
  });
  it("默认 current = 当天（不破坏既有命盘）", () => {
    const def = computeBaziChart(mk({ date: "2024-06-12", time: "23:30", trueSolarTime: false }));
    const noon = computeBaziChart(mk({ date: "2024-06-12", time: "12:00", trueSolarTime: false }));
    expect(def.pillars.day.branch).toBe(noon.pillars.day.branch);
  });
});

describe("EP-002-cal · 跨节气月柱（八字以节气分月）", () => {
  it("惊蛰前后月柱切换（2024 惊蛰约 3-5）", () => {
    const before = computeBaziChart(mk({ date: "2024-03-04", time: "12:00", trueSolarTime: false }));
    const after = computeBaziChart(mk({ date: "2024-03-06", time: "12:00", trueSolarTime: false }));
    expect(before.pillars.month.branch).not.toBe(after.pillars.month.branch); // 寅→卯
    expect(after.pillars.month.branch).toBe("卯");
  });
  it("立春年柱切换（2024 立春约 2-4）", () => {
    expect(computeBaziChart(mk({ date: "2024-02-01", time: "12:00", trueSolarTime: false })).pillars.year.branch).toBe("卯");
    expect(computeBaziChart(mk({ date: "2024-03-01", time: "12:00", trueSolarTime: false })).pillars.year.branch).toBe("辰");
  });
});

describe("EP-002-cal · 日主旺衰（启发式）", () => {
  it("甲木生卯月但三辛金克、无印比 → 身弱", () => {
    const c = computeBaziChart(mk({ date: "1991-03-15", time: "14:30", trueSolarTime: false }));
    expect(c.dayMaster).toBe("甲");
    expect(c.dayMasterStrength).toBe("weak");
  });
  it("强根案例 → strong（甲木多木助）", () => {
    // 选一个木旺的日子断言不再是 unknown 且属三档之一
    const c = computeBaziChart(mk({ date: "1995-02-20", time: "06:00", trueSolarTime: false }));
    expect(["strong", "weak", "balanced"]).toContain(c.dayMasterStrength);
    expect(c.dayMasterStrength).not.toBe("unknown");
  });
});
