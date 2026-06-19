import { Solar } from "lunar-typescript";
import { stemElement, branchElement } from "../utils/elements";
import { deriveUsefulElements } from "../bazi/useful-elements";
import type { UnifiedChart } from "../types/chart";

// 地支关系表（EP-504）
const CHONG = [["子", "午"], ["丑", "未"], ["寅", "申"], ["卯", "酉"], ["辰", "戌"], ["巳", "亥"]];
const LIUHE = [["子", "丑"], ["寅", "亥"], ["卯", "戌"], ["辰", "酉"], ["巳", "申"], ["午", "未"]];
const SANHE = [["申", "子", "辰"], ["寅", "午", "戌"], ["巳", "酉", "丑"], ["亥", "卯", "未"]];
const XING = [["子", "卯"], ["寅", "巳"], ["巳", "申"], ["丑", "戌"], ["戌", "未"]]; // 主要相刑（自刑略）
const HAI = [["子", "未"], ["丑", "午"], ["寅", "巳"], ["卯", "辰"], ["申", "亥"], ["酉", "戌"]];
const hasPair = (list: string[][], a: string, b: string) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

export type BranchRelation = "冲" | "合" | "三合" | "刑" | "害";

/** 两地支关系（优先级 冲>合>三合>刑>害；自刑/无关系返回 null）。 */
export function branchRelation(a: string, b: string): BranchRelation | null {
  if (a === b) return null;
  if (hasPair(CHONG, a, b)) return "冲";
  if (hasPair(LIUHE, a, b)) return "合";
  if (SANHE.some((g) => g.includes(a) && g.includes(b))) return "三合";
  if (hasPair(XING, a, b)) return "刑";
  if (hasPair(HAI, a, b)) return "害";
  return null;
}

/** 互动注解（厚卦象喂料，反思性、非决定论）。 */
function interactionNote(kind: BranchRelation, dayZhi: string, label: string, branch: string): string {
  const head = `今日${dayZhi}${kind}命${label}支${branch}`;
  switch (kind) {
    case "冲": return `${head}${label === "日" ? "，主自身动荡、宜稳不宜急" : "，相关之事易有变动"}`;
    case "合": return `${head}，相关之事较顺、利协作`;
    case "三合": return `${head}，气势相生、宜借势而为`;
    case "刑": return `${head}，易生摩擦口角，宜退让`;
    case "害": return `${head}，暗耗琐扰，宜防小人`;
  }
}

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
  /** 流日 × 本命四支 的冲合刑害（EP-504，千人千日 + 厚卦象喂料） */
  interactions: { kind: BranchRelation; withPillar: "年" | "月" | "日" | "时"; branch: string; note: string }[];
  /** 当日五行是否命主喜用 */
  favorableToday: boolean;
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

  // EP-504：流日地支 × 本命四支 → 冲合刑害；用神 → favorableToday；据此调分（千人千日）
  const useful = deriveUsefulElements(chart.bazi);
  const favorableToday = useful.favorable.includes(dayElement);
  const unfavorableToday = useful.unfavorable.includes(dayElement);

  const PILLAR_LABEL = [
    { key: "year" as const, label: "年" as const },
    { key: "month" as const, label: "月" as const },
    { key: "day" as const, label: "日" as const },
    { key: "hour" as const, label: "时" as const },
  ];
  const interactions: DailyFortune["interactions"] = [];
  for (const { key, label } of PILLAR_LABEL) {
    const np = chart.bazi.pillars[key];
    if (!np) continue;
    const kind = branchRelation(dayZhi, np.branch);
    if (kind) interactions.push({ kind, withPillar: label, branch: np.branch, note: interactionNote(kind, dayZhi, label, np.branch) });
  }

  const chongDay = interactions.some((i) => i.kind === "冲" && i.withPillar === "日");
  const heAny = interactions.some((i) => i.kind === "合" || i.kind === "三合");
  let delta = 0;
  if (favorableToday) delta += 1;
  if (unfavorableToday) delta -= 1;
  if (chongDay) delta -= 1;
  if (heAny) delta += 1;
  const clamp = (n: number) => Math.max(1, Math.min(10, n));
  const scores = Object.fromEntries(
    Object.entries(prof.base).map(([k, v]) => [k, clamp(v + delta)]),
  ) as typeof prof.base;

  return {
    date: dateStr,
    dayGanZhi: dayGan + dayZhi,
    dayElement,
    dayBranchElement: branchElement(dayZhi),
    masterElement,
    relation: rel,
    scores,
    tone: prof.tone,
    interactions,
    favorableToday,
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
