import { describe, it, expect } from "vitest";
import { computeUnifiedChart, computeZiweiHoroscope, BirthInputSchema } from "@eamvp/core";
import { extractTimelineFacts } from "../src/timeline";

const input = BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 });
const chart = computeUnifiedChart(input);
const horo = computeZiweiHoroscope(input, "2026-06-22");

describe("EP-521 时序层 extractTimelineFacts", () => {
  const tf = extractTimelineFacts(chart, horo);

  it("流年/大限干支 + 四化承重", () => {
    expect(tf.yearly.ganzhi).toBe("丙午");
    expect(tf.yearly.mutagens.忌).toBe("廉贞");
    expect(tf.decadal.ganzhi).toBe("壬辰");
  });

  it("八字大运 + 日主 + 喜用接地", () => {
    expect(tf.dayMaster).toBe("甲");
    expect(tf.favorableElements).toEqual(expect.arrayContaining(["木", "水"]));
    expect(tf.luckPillar).toBe(chart.bazi.currentLuckPillar ?? null);
  });
});
