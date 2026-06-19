import { describe, it, expect } from "vitest";
import { scoreReading, sanitizeReading } from "../src/index";
import type { ChartFacts } from "../src/facts";

/** 受控事实：直接构造，使评分器逻辑与真实命盘星曜分布解耦、断言稳定。 */
function facts(over?: Partial<ChartFacts["ziwei"]>, western: ChartFacts["western"] = SOME_WEST): ChartFacts {
  return {
    normalizedSolarTime: "1991-03-15 14:36",
    bazi: { dayMaster: "甲", dayMasterElement: "木", yearPillar: "辛未", monthPillar: "辛卯", dayPillar: "甲申", hourPillar: "辛未", fiveElementCounts: { 金: 4, 木: 2, 水: 0, 火: 0, 土: 2 }, tenGods: ["正官"], currentLuckPillar: "丁亥" },
    ziwei: {
      school: "zhongzhou",
      soulPalace: { branch: "未", stars: [] }, // 空宫
      bodyPalaceBranch: "酉",
      fortunePalace: { stars: ["禄存"] },
      spousePalace: { stars: [] },
      careerPalace: { stars: ["太阴·庙", "文曲·旺(化科)"] },
      wealthPalace: { stars: ["天梁·庙", "文昌·利(化忌)"] },
      allPalaces: [
        { name: "命宫", branch: "未", majorStars: [] },
        { name: "官禄", branch: "卯", majorStars: ["太阴·庙"] },
        { name: "财帛", branch: "亥", majorStars: ["天梁·庙"] },
        { name: "福德", branch: "酉", majorStars: [] },
      ],
      birthMutagens: { 禄: "巨门", 权: "太阳", 科: "文曲", 忌: "文昌" },
      jiPalace: "财帛宫",
      ...over,
    },
    western,
  };
}
const SOME_WEST: ChartFacts["western"] = { sun: "Pisces 8宫", moon: "Pisces 8宫", ascendant: "Leo", saturn: "Aquarius 7宫", hardAspects: ["Sun square Saturn"], softAspects: [] };

const GOOD = `## 概览
命宫为空宫，借三方四正而立，含蓄自持。
## 命理 — 紫微/八字
福德宫见禄存，内在自有所守；官禄宫太阴文曲，文昌化忌落财帛，宜表达而不自苛。日主甲木。
## 心理 — 心理占星
太阳月亮双鱼，土星七宫，是关系中的功课。
## 成长建议
让内在的水气流动。本文仅供自我观照，非吉凶预言，请理性判断。`;

describe("好解读：无幻觉/无错配/四段齐全 → pass", () => {
  it("pass + grounding 满分", () => {
    const v = scoreReading(GOOD, facts());
    expect(v.pass).toBe(true);
    expect(v.grounding.hallucinatedStars).toHaveLength(0);
    expect(v.grounding.mutagenErrors).toHaveLength(0);
    expect(v.format.sectionsFound).toBe(4);
  });
});

describe("接地性：星曜不在事实里 → 幻觉", () => {
  it("捏造『破军』（不在 allPalaces）→ 抓出、不 pass", () => {
    const bad = GOOD.replace("福德宫见禄存", "命宫破军坐守，福德宫见禄存");
    const v = scoreReading(bad, facts());
    expect(v.grounding.hallucinatedStars).toContain("破军");
    expect(v.pass).toBe(false);
  });
});

describe("四化接地：化曜错配 → 抓出", () => {
  it("说『贪狼化忌』但生年化忌实为文昌 → mutagenErrors、不 pass", () => {
    const bad = GOOD.replace("文昌化忌落财帛", "贪狼化忌落财帛");
    const v = scoreReading(bad, facts());
    expect(v.grounding.mutagenErrors).toContain("贪狼化忌");
    expect(v.pass).toBe(false);
  });
});

describe("越界：西方盘缺失却谈行星/星座", () => {
  it("western=null 时提到『土星/双鱼』→ westernLeak、不 pass", () => {
    const v = scoreReading(GOOD, facts(undefined, null));
    expect(v.grounding.westernLeak.length).toBeGreaterThan(0);
    expect(v.pass).toBe(false);
  });

  it("sanitizeReading 兜底：净化后心理段无行星/星座，重评 pass", () => {
    const cleaned = sanitizeReading(GOOD, "zh", false);
    expect(cleaned).not.toContain("土星");
    expect(cleaned).not.toContain("双鱼");
    expect(cleaned).toContain("需要出生时辰");
    const v = scoreReading(cleaned, facts(undefined, null));
    expect(v.grounding.westernLeak).toHaveLength(0);
    expect(v.pass).toBe(true);
  });
});

describe("守护栏：决定论 / 医疗断言 / 缺免责", () => {
  it("『必然会』『你会得』→ 违规、不 pass", () => {
    const bad = GOOD.replace("宜表达而不自苛", "你必然会成功，你会得富贵");
    const v = scoreReading(bad, facts());
    expect(v.guardrails.violations).toEqual(expect.arrayContaining(["必然会", "你会得"]));
    expect(v.pass).toBe(false);
  });
  it("缺免责 → 守护栏扣分", () => {
    const noDisc = GOOD.replace("本文仅供自我观照，非吉凶预言，请理性判断。", "祝你顺遂。");
    const v = scoreReading(noDisc, facts());
    expect(v.guardrails.hasDisclaimer).toBe(false);
    expect(v.guardrails.score).toBeLessThan(scoreReading(GOOD, facts()).guardrails.score);
  });
});

describe("格式：四段并三段 → 检出缺段", () => {
  it("缺『心理』分节 → missing 含 心理、sectionsFound=3", () => {
    const three = `## 概览\nx\n## 命理 — 紫微/八字\n福德宫禄存。\n## 成长建议\n仅供自我观照。`;
    const v = scoreReading(three, facts());
    expect(v.format.missing).toContain("心理");
    expect(v.format.sectionsFound).toBe(3);
  });
});
