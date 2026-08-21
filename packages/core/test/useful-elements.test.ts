import { describe, it, expect } from "vitest";
import { computeBaziChart, BirthInputSchema } from "../src/index";
import { deriveUsefulElements } from "../src/bazi/useful-elements";
import type { BirthInput } from "../src/index";

const mk = (over: Partial<BirthInput>): BirthInput =>
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

describe("EP-501 用神/喜忌 deriveUsefulElements（扶抑法）", () => {
  it("甲木身弱 → 喜用 水木（印+比），忌 火土金", () => {
    const u = deriveUsefulElements(computeBaziChart(mk({})));
    expect(u.method).toBe("扶抑");
    expect(u.favorable.sort()).toEqual(["木", "水"]);
    expect(u.unfavorable.sort()).toEqual(["土", "火", "金"]);
  });

  it("喜用与忌神互斥，且非中和时覆盖全部五行", () => {
    const u = deriveUsefulElements(computeBaziChart(mk({})));
    const overlap = u.favorable.filter((e) => u.unfavorable.includes(e));
    expect(overlap).toEqual([]);
    expect(new Set([...u.favorable, ...u.unfavorable]).size).toBe(5);
  });
});

describe("EP-002-cal-2 调候（季节微调）", () => {
  it("丙火强生于夏（巳月）→ favorable 含 水/金，method=调候，note 提调候", () => {
    const chart = computeBaziChart(mk({ date: "1986-05-22" }));
    expect(chart.pillars.day.stem).toBe("丙");
    expect(chart.pillars.month.branch).toBe("巳");
    const u = deriveUsefulElements(chart);
    expect(u.method).toBe("调候");
    expect(u.favorable).toEqual(expect.arrayContaining(["水", "金"]));
    expect(u.note).toContain("调候");
  });

  it("庚金弱生于冬（子月）→ 调候喜火暖局，火从忌神移入喜用", () => {
    const chart = computeBaziChart(mk({ date: "1985-01-01" }));
    expect(chart.pillars.day.stem).toBe("庚");
    expect(chart.pillars.month.branch).toBe("子");
    const u = deriveUsefulElements(chart);
    expect(u.method).toBe("调候");
    expect(u.favorable).toContain("火");
    expect(u.unfavorable).not.toContain("火");
    // 互斥 + 覆盖全部五行的不变式在调候覆盖后仍须成立
    const overlap = u.favorable.filter((e) => u.unfavorable.includes(e));
    expect(overlap).toEqual([]);
    expect(new Set([...u.favorable, ...u.unfavorable]).size).toBe(5);
  });

  it("春季（卯月）不作强制调候微调，method 仍为扶抑", () => {
    const u = deriveUsefulElements(computeBaziChart(mk({ date: "1991-03-15" })));
    expect(u.method).toBe("扶抑");
  });
});
