import type { UnifiedChart, Palace } from "../types/chart";
import { deriveStrength } from "../bazi/strength";
import { deriveWesternProfile } from "../western/profile";

/**
 * 本命之灵 · 人格种子（EP-spirit-01）。
 *
 * 从「已冻结的命盘」确定性派生一个陪伴人格的「种子」——**不调用 LLM、不进冻结命盘**，
 * 与 deriveStrength/deriveTriad/deriveWesternProfile 同属「facts 层派生」。
 * LLM 只负责把这枚种子「渲染成口吻」（见 @eamvp/llm spirit.ts），杜绝灵的身份被模型臆造。
 *
 * 锚点全部取自命盘既有字段：
 * - 主导五行 = 八字五行计数峰（决定水墨印记与基调）
 * - 命主星  = 西方上升守护星落点；西方盘缺失时退紫微命宫主星
 * - 福德宫  = 东西心理桥接最强锚点
 * - 核心张力 = 西方首条硬相位；缺失时退紫微生年化忌所落宫
 */

export type SpiritElement = "wood" | "fire" | "earth" | "metal" | "water";

export type SpiritPersona = {
  /** 原型标签（en 为主，首发海外） */
  archetype: string;
  /** 主导五行 → 印记与色调基调 */
  dominantElement: SpiritElement;
  /** 口吻提示，2–4 个 */
  toneHints: string[];
  /** 灵可在开场白/对话中引用的承重事实标签（命主星/福德/张力等，均来自命盘） */
  anchorFacts: string[];
  /** 核心成长课题（格林式，反思性，一句话） */
  coreTension: string;
};

const CN_TO_EN: Record<string, SpiritElement> = {
  木: "wood",
  火: "fire",
  土: "earth",
  金: "metal",
  水: "water",
};
// 平局时的确定性优先序
const ELEMENT_ORDER: string[] = ["木", "火", "土", "金", "水"];

const ELEMENT_ARCHETYPE: Record<SpiritElement, string> = {
  wood: "生发者",
  fire: "燃灯者",
  earth: "守界者",
  metal: "淬炼者",
  water: "映渊者",
};

const ELEMENT_TONE: Record<SpiritElement, string[]> = {
  wood: ["温润", "前瞻"],
  fire: ["热忱", "直率"],
  earth: ["沉稳", "务实"],
  metal: ["清明", "锐利"],
  water: ["内省", "流动"],
};

function dominantElement(counts: Record<string, number>): SpiritElement {
  let best = "木";
  let bestN = -Infinity;
  for (const cn of ELEMENT_ORDER) {
    const n = counts[cn] ?? 0;
    if (n > bestN) {
      bestN = n;
      best = cn;
    }
  }
  return CN_TO_EN[best] ?? "earth";
}

function palaceByName(palaces: Palace[], name: string): Palace | undefined {
  return palaces.find((p) => p.name.includes(name));
}

function majorStarNames(p: Palace | undefined): string[] {
  if (!p) return [];
  return p.majorStars.map((s) => s.name);
}

export function deriveSpirit(chart: UnifiedChart): SpiritPersona {
  const el = dominantElement(chart.bazi.fiveElementCounts);
  const verdict = deriveStrength(chart.bazi).verdict;

  // 口吻：主导五行基调 + 旺衰微调
  const toneHints = [...ELEMENT_TONE[el]];
  if (verdict === "strong") toneHints.push("笃定");
  else if (verdict === "weak") toneHints.push("温和");

  const anchorFacts: string[] = [];

  // 命主星：西方上升守护星落点优先；西方盘缺失退紫微命宫主星
  const w = chart.western;
  if (w) {
    const ruler = deriveWesternProfile(w).chartRuler;
    anchorFacts.push(`chart ruler ${ruler.planet} (${ruler.placement})`);
  } else {
    const soulStars = majorStarNames(palaceByName(chart.ziwei.palaces, "命"));
    if (soulStars.length) anchorFacts.push(`soul-palace stars ${soulStars.join("、")}`);
  }

  // 福德宫主星（东西心理桥接锚点）
  const fortuneStars = majorStarNames(palaceByName(chart.ziwei.palaces, "福德"));
  if (fortuneStars.length) anchorFacts.push(`fortune-palace stars ${fortuneStars.join("、")}`);

  // 核心张力：西方首条硬相位；缺失退紫微生年化忌所落宫
  let coreTension: string;
  const hard = w?.aspects.find((a) => a.quality === "hard");
  if (hard) {
    coreTension = `the inner tension of ${hard.from} ${hard.type} ${hard.to}`;
    anchorFacts.push(coreTension);
  } else {
    const jiStar = chart.ziwei.birthMutagens.忌;
    const jiPalace = chart.ziwei.palaces.find((p) =>
      [...p.majorStars, ...p.minorStars].some((s) => s.name === jiStar && s.mutagen === "忌"),
    );
    coreTension = jiPalace
      ? `the pull of 化忌 (${jiStar}) in your ${jiPalace.name}`
      : `learning to hold your own contradictions`;
    if (jiPalace) anchorFacts.push(coreTension);
  }

  return {
    archetype: ELEMENT_ARCHETYPE[el],
    dominantElement: el,
    toneHints,
    anchorFacts,
    coreTension,
  };
}
