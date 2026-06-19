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
