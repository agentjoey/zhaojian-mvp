import { describe, it, expect } from "vitest";
import { correctMutagens, scoreReading } from "../src/index";
import type { ChartFacts } from "../src/facts";

// 辛年命盘四化：禄巨门 权太阳 科文曲 忌文昌
const MUT = { 禄: "巨门", 权: "太阳", 科: "文曲", 忌: "文昌" };

describe("correctMutagens：删错误化曜断言、留星名（只删不替）", () => {
  it("『紫微化忌』(不存在的配对) → 删为『紫微』", () => {
    const r = correctMutagens("紫微化忌落于财帛，主反复。", MUT);
    expect(r.text).toBe("紫微落于财帛，主反复。");
    expect(r.fixed).toContain("紫微化忌");
  });
  it("『文昌化忌』但本年文昌实为化科 → wait 文昌确为辛年忌，保留", () => {
    const r = correctMutagens("文昌化忌主文书心结。", MUT);
    expect(r.text).toBe("文昌化忌主文书心结。"); // 正确配对，不动
    expect(r.fixed).toHaveLength(0);
  });
  it("丙年场景：忌=廉贞，模型误写『文昌化忌』→ 删", () => {
    const bing = { 禄: "天同", 权: "天机", 科: "文昌", 忌: "廉贞" };
    const r = correctMutagens("文昌化忌，主才智受困。", bing);
    expect(r.text).toBe("文昌，主才智受困。");
    expect(r.fixed).toContain("文昌化忌");
  });
  it("正确配对全部保留（巨门化禄/太阳化权/文曲化科/文昌化忌）", () => {
    const r = correctMutagens("巨门化禄、太阳化权、文曲化科、文昌化忌各安其位。", MUT);
    expect(r.fixed).toHaveLength(0);
  });
});

describe("纠正后评分越界归零（与 scorer 同源）", () => {
  it("纠正后 mutagenErrors 清空", () => {
    const facts: ChartFacts = {
      normalizedSolarTime: "x", bazi: { dayMaster: "甲", dayMasterElement: "木", yearPillar: "辛未", monthPillar: "辛卯", dayPillar: "甲申", hourPillar: "辛未", fiveElementCounts: {}, tenGods: [], currentLuckPillar: null },
      ziwei: { school: "zhongzhou", soulPalace: { branch: "未", stars: [] }, bodyPalaceBranch: "酉", fortunePalace: { stars: [] }, spousePalace: { stars: [] }, careerPalace: { stars: [] }, wealthPalace: { stars: [] }, allPalaces: [], birthMutagens: MUT, jiPalace: null },
      western: null,
    };
    const bad = "## 概览\nx\n## 命理\n紫微化忌坐命。\n## 心理\n需要出生时辰。\n## 成长建议\n仅供自我观照。";
    expect(scoreReading(bad, facts).grounding.mutagenErrors).toContain("紫微化忌");
    const cleaned = correctMutagens(bad, MUT).text;
    expect(scoreReading(cleaned, facts).grounding.mutagenErrors).toHaveLength(0);
  });
});
