import { Solar } from "lunar-typescript";
import { stemElement, branchElement } from "../utils/elements";
import type { UnifiedChart } from "../types/chart";

/**
 * 运势日历 —— 当日流日 × 命主，确定性生成每日「趋吉避祸」。
 * 纯函数（按 chart.dayMaster + date 可缓存）；不调用 LLM。
 * 评分为命理启发式 + 黄历宜忌，语气克制、非决定论。见 EP-008。
 */

const GENERATES: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const CONTROLS: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

export type Relation = "比和" | "印" | "食伤" | "财" | "官杀";

/** 今日五行 E 相对命主 M 的十神类关系。 */
function relation(today: string, master: string): Relation {
  if (today === master) return "比和";
  if (GENERATES[today] === master) return "印"; // 今生我
  if (GENERATES[master] === today) return "食伤"; // 我生今
  if (CONTROLS[today] === master) return "官杀"; // 今克我
  return "财"; // 我克今
}

type DimScores = { overall: number; career: number; wealth: number; love: number; health: number; travel: number };

// 各关系的五维基线（0–10），克制中庸，避免极端。
const RELATION_PROFILE: Record<Relation, { base: DimScores; tone: string; auspicious: string[]; caution: string[] }> = {
  印: {
    base: { overall: 7, career: 7, wealth: 6, love: 6, health: 8, travel: 6 },
    tone: "今日得生，宜休整蓄力、亲近师友、读书思考。",
    auspicious: ["静心学习或复盘", "寻求贵人/长辈建议", "整理与休息"],
    caution: ["不宜过度劳形", "不必急于求成"],
  },
  比和: {
    base: { overall: 6, career: 6, wealth: 6, love: 6, health: 7, travel: 7 },
    tone: "今日同气，宜协作同行、稳中求进，留意与人争利。",
    auspicious: ["与同伴协作推进", "稳健的日常事务"],
    caution: ["避免与人争抢、合伙易生摩擦", "勿冲动消费"],
  },
  食伤: {
    base: { overall: 6, career: 6, wealth: 6, love: 7, health: 6, travel: 7 },
    tone: "今日宜表达，利创作、沟通、付出与展现，注意言多有失。",
    auspicious: ["创作、写作、表达想法", "走访、社交、传递善意"],
    caution: ["言语留三分，避免口舌", "勿耗散过度"],
  },
  财: {
    base: { overall: 7, career: 7, wealth: 8, love: 6, health: 6, travel: 6 },
    tone: "今日临财，利行动、理财、掌控节奏，量力而为不贪。",
    auspicious: ["处理财务、推进务实之事", "主动出击、把握节奏"],
    caution: ["勿因贪而冒进", "身弱者忌过劳逐利"],
  },
  官杀: {
    base: { overall: 5, career: 6, wealth: 5, love: 5, health: 5, travel: 5 },
    tone: "今日受制，宜守成、循规、克己，压力中见定力。",
    auspicious: ["守成、按章办事", "以静制动、自律克己"],
    caution: ["避免冲动决策与对抗", "注意情绪与休息"],
  },
};

export type DailyFortune = {
  date: string; // YYYY-MM-DD
  dayGanZhi: string; // 今日干支
  dayElement: string; // 今日五行（日干）
  dayBranchElement: string; // 今日地支五行（用于干支配色）
  masterElement: string; // 命主五行
  relation: Relation;
  scores: DimScores;
  tone: string; // 一句总评
  auspicious: string[]; // 趋吉（宜）
  caution: string[]; // 避祸（忌）
  almanacYi: string[]; // 黄历·宜
  almanacJi: string[]; // 黄历·忌
  lunarDate: string; // 农历
};

/** date 缺省为传入的「今天」（调用方传 YYYY-MM-DD，避免 Date.now 不确定性）。 */
export function computeDailyFortune(chart: Pick<UnifiedChart, "bazi">, dateStr: string): DailyFortune {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();

  const dayGan = lunar.getDayGan();
  const dayZhi = lunar.getDayZhi();
  const dayElement = stemElement(dayGan);
  const masterElement = chart.bazi.dayMasterElement;
  const rel = relation(dayElement, masterElement);
  const prof = RELATION_PROFILE[rel];

  const almanacYi = safeArr(() => lunar.getDayYi());
  const almanacJi = safeArr(() => lunar.getDayJi());

  return {
    date: dateStr,
    dayGanZhi: dayGan + dayZhi,
    dayElement,
    dayBranchElement: branchElement(dayZhi),
    masterElement,
    relation: rel,
    scores: prof.base,
    tone: prof.tone,
    auspicious: [...prof.auspicious, ...almanacYi.slice(0, 2)],
    caution: [...prof.caution, ...almanacJi.slice(0, 2)],
    almanacYi: almanacYi.slice(0, 6),
    almanacJi: almanacJi.slice(0, 6),
    lunarDate: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
  };
}

function safeArr(f: () => string[]): string[] {
  try {
    return f() ?? [];
  } catch {
    return [];
  }
}
