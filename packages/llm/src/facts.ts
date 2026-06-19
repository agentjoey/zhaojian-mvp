import type { UnifiedChart, Palace } from "@eamvp/core";
import { deriveStrength, deriveUsefulElements, deriveTriad, deriveWesternProfile } from "@eamvp/core";

/**
 * 把 UnifiedChart 压成「带标签的承重事实」喂给 LLM。
 * 关键反幻觉手段：模型只准引用这里出现的星曜/宫位/相位，不得自行推算。
 * 同时刻意挑选与「心理解读」最相关的字段（命宫/福德宫/化忌/硬相位/土星）。
 */

export type ChartFacts = {
  normalizedSolarTime: string;
  bazi: {
    dayMaster: string;
    dayMasterElement: string;
    yearPillar: string;
    monthPillar: string;
    dayPillar: string;
    hourPillar: string | null;
    fiveElementCounts: Record<string, number>;
    tenGods: string[]; // 年/月/时柱十神（日柱为日主）
    currentLuckPillar: string | null;
    /** 旺衰判据（EP-502）：内部权衡用，勿照搬入文。仅留定性证据，不含原始数值（防泄漏）。 */
    strength: { verdict: string; 得令: boolean; roots: { branch: string; via: string }[] };
    /** 用神/喜忌（EP-501，扶抑法）：成长建议据此接地 */
    favorableElements: string[];
    unfavorableElements: string[];
    usefulNote: string;
  };
  ziwei: {
    school: string;
    soulPalace: { branch: string; stars: string[] };
    bodyPalaceBranch: string;
    fortunePalace: { stars: string[] }; // 福德宫 —— 东西心理桥接最强锚点
    spousePalace: { stars: string[] };
    careerPalace: { stars: string[] };
    wealthPalace: { stars: string[] };
    /** 全 12 宫主星（含亮度/四化），给模型完整接地，杜绝臆造未给出的星 */
    allPalaces: { name: string; branch: string; majorStars: string[] }[];
    birthMutagens: Record<string, string>; // 禄/权/科/忌 → 星
    jiPalace: string | null; // 生年化忌所落宫位（最具解读价值）
    /** 命宫三方四正借星（EP-503）：空宫据此解读，勿臆造 */
    soulTriad: { stars: string[]; borrowedFrom: string[]; isEmpty: boolean };
  };
  western: {
    sun: string | null;
    moon: string | null;
    ascendant: string | null;
    saturn: string | null; // 格林招牌：核心课题
    hardAspects: string[]; // 内在张力/成长课题
    softAspects: string[];
    /** 心理画像增强（EP-505） */
    elementBalance: Record<string, number>;
    modalityBalance: Record<string, number>;
    chartRuler: string; // 命主星 + 落点
    moonPhase: string;
    patterns: string[]; // 星群/相位簇
  } | null;
};

function palaceByName(palaces: Palace[], name: string): Palace | undefined {
  return palaces.find((p) => p.name.includes(name));
}

function starNames(p: Palace | undefined): string[] {
  if (!p) return [];
  return [...p.majorStars, ...p.minorStars].map(
    (s) => s.name + (s.brightness ? `·${s.brightness}` : "") + (s.mutagen ? `(化${s.mutagen})` : ""),
  );
}

function planet(chart: NonNullable<UnifiedChart["western"]>, name: string): string | null {
  const p = chart.planets.find((x) => x.name.toLowerCase() === name);
  return p ? `${p.sign} ${p.house}宫${p.retrograde ? " R" : ""}` : null;
}

export function extractFacts(chart: UnifiedChart): ChartFacts {
  const z = chart.ziwei;
  const soul = palaceByName(z.palaces, "命");
  const jiStar = z.birthMutagens.忌;
  const jiPalace = z.palaces.find((p) => [...p.majorStars, ...p.minorStars].some((s) => s.name === jiStar && s.mutagen === "忌"));

  const w = chart.western;
  const strength = deriveStrength(chart.bazi);
  const useful = deriveUsefulElements(chart.bazi);
  const triad = deriveTriad(z.palaces, "命");
  const wp = w ? deriveWesternProfile(w) : null;

  return {
    normalizedSolarTime: chart.normalizedSolarTime,
    bazi: {
      dayMaster: chart.bazi.dayMaster,
      dayMasterElement: chart.bazi.dayMasterElement,
      yearPillar: chart.bazi.pillars.year.stem + chart.bazi.pillars.year.branch,
      monthPillar: chart.bazi.pillars.month.stem + chart.bazi.pillars.month.branch,
      dayPillar: chart.bazi.pillars.day.stem + chart.bazi.pillars.day.branch,
      hourPillar: chart.bazi.pillars.hour ? chart.bazi.pillars.hour.stem + chart.bazi.pillars.hour.branch : null,
      fiveElementCounts: chart.bazi.fiveElementCounts,
      tenGods: [
        chart.bazi.pillars.year.tenGodStem,
        chart.bazi.pillars.month.tenGodStem,
        chart.bazi.pillars.hour?.tenGodStem,
      ].filter((x): x is string => Boolean(x)),
      currentLuckPillar: chart.bazi.currentLuckPillar ?? null,
      strength: {
        verdict: strength.verdict,
        得令: strength.得令,
        roots: strength.roots.map((r) => ({ branch: r.branch, via: r.via })),
      },
      favorableElements: useful.favorable,
      unfavorableElements: useful.unfavorable,
      usefulNote: useful.note,
    },
    ziwei: {
      school: z.school,
      soulPalace: { branch: z.soulPalaceBranch, stars: starNames(soul) },
      bodyPalaceBranch: z.bodyPalaceBranch,
      fortunePalace: { stars: starNames(palaceByName(z.palaces, "福德")) },
      spousePalace: { stars: starNames(palaceByName(z.palaces, "夫妻")) },
      careerPalace: { stars: starNames(palaceByName(z.palaces, "官禄")) },
      wealthPalace: { stars: starNames(palaceByName(z.palaces, "财帛")) },
      allPalaces: z.palaces.map((p) => ({
        name: p.name,
        branch: p.branch,
        majorStars: p.majorStars.map((s) => s.name + (s.brightness ? `·${s.brightness}` : "") + (s.mutagen ? `(化${s.mutagen})` : "")),
      })),
      birthMutagens: z.birthMutagens,
      jiPalace: jiPalace?.name ?? null,
      soulTriad: { stars: triad.stars, borrowedFrom: triad.borrowedFrom, isEmpty: triad.isEmpty },
    },
    western: w && wp
      ? {
          sun: planet(w, "sun"),
          moon: planet(w, "moon"),
          ascendant: `${w.ascendant.sign}`,
          saturn: planet(w, "saturn"),
          hardAspects: w.aspects.filter((a) => a.quality === "hard").map((a) => `${a.from} ${a.type} ${a.to} (orb ${a.orb}°)`),
          softAspects: w.aspects.filter((a) => a.quality === "soft").map((a) => `${a.from} ${a.type} ${a.to}`),
          elementBalance: wp.elementBalance,
          modalityBalance: wp.modalityBalance,
          chartRuler: `${wp.chartRuler.planet} ${wp.chartRuler.placement}`,
          moonPhase: wp.moonPhase,
          patterns: wp.patterns,
        }
      : null,
  };
}
