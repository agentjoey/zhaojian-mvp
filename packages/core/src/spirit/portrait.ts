import type { UnifiedChart } from "../types/chart";
import { deriveWesternProfile } from "../western/profile";
import type { QuestionnaireAnswers } from "./questionnaire";

/**
 * 自我画像（EP-spirit-08）：从命盘确定性派生 5 维「内在画像」，
 * 由八字五行平衡 + 西方元素/模式平衡合成；问卷自陈做轻微调制。
 * 纯函数、确定性、不进冻结命盘；随互动（问卷/记忆）演化。非预测、反思性。
 */

export type SelfPortraitDimension = { key: string; label: string; value: number }; // value 1..10

export type SelfPortrait = {
  dimensions: SelfPortraitDimension[];
  dominantElement: string;
  note: string;
};

const DIM_LABELS: Record<string, string> = {
  grounding: "沉稳",
  drive: "行动",
  reflection: "内省",
  connection: "联结",
  openness: "开阔",
};

const ELEMENT_NOTE: Record<string, string> = {
  wood: "你向着可能生长；守住让根扎深的那份耐心。",
  fire: "你以热与信念前行；守住让火光保持温柔的稳定。",
  earth: "你稳住并守护所珍视的；守住那份开放，别让厚土筑成围墙。",
  metal: "你善于淬炼与明辨；守住那份柔软，别让清明伤人。",
  water: "你在深处感受、随之流动；守住一处河岸，给深渊以形。",
};

const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));

export function deriveSelfPortrait(
  chart: UnifiedChart,
  opts?: { memoryPresent?: boolean; questionnaire?: QuestionnaireAnswers },
): SelfPortrait {
  const c = chart.bazi.fiveElementCounts;
  const wood = c["木"] ?? 0, fire = c["火"] ?? 0, earth = c["土"] ?? 0, metal = c["金"] ?? 0, water = c["水"] ?? 0;
  const maxEl = Math.max(wood, fire, earth, metal, water, 1);
  // 归一到主导元素=1，使最强元素拉满该维度
  const nWood = wood / maxEl, nFire = fire / maxEl, nEarth = earth / maxEl, nMetal = metal / maxEl, nWater = water / maxEl;

  const w = chart.western ? deriveWesternProfile(chart.western) : null;
  const wel = w?.elementBalance;
  const wtot = wel ? (wel.fire + wel.earth + wel.air + wel.water) || 1 : 1;
  const wf = wel ? wel.fire / wtot : 0, we = wel ? wel.earth / wtot : 0, wa = wel ? wel.air / wtot : 0, ww = wel ? wel.water / wtot : 0;
  const wmod = w?.modalityBalance;
  const mtot = wmod ? (wmod.cardinal + wmod.fixed + wmod.mutable) || 1 : 1;
  const mc = wmod ? wmod.cardinal / mtot : 0, mf = wmod ? wmod.fixed / mtot : 0, mm = wmod ? wmod.mutable / mtot : 0;

  // 每维 = 八字合成(0..1) 与 西方合成(0..1) 的加权；无西方盘则纯八字。
  const blend = (bazi: number, west: number) =>
    w ? (bazi * 0.6 + west * 0.4) * 10 : bazi * 10;

  const raw: Record<string, number> = {
    grounding: blend(nEarth, (we + mf) / 2),
    drive: blend((nFire + nMetal) / 2, (wf + mc) / 2),
    reflection: blend(nWater, (ww + mm) / 2),
    connection: blend((nWater + nWood) / 2, (ww + wa) / 2),
    openness: blend(nWood, (wa + mm) / 2),
  };

  // 问卷自陈轻调（主观自我认知微调客观画像）
  const q = opts?.questionnaire;
  if (q) {
    if (q.stress === "connect") raw.connection += 1.2;
    if (q.stress === "withdraw") raw.reflection += 1.2;
    if (q.stress === "push") raw.drive += 1.2;
    if (q.growth === "peace") raw.reflection += 1;
    if (q.growth === "relationships") raw.connection += 1;
    if (q.growth === "purpose") raw.drive += 1;
    if (q.growth === "understanding") raw.reflection += 1;
    if (q.energy === "people") raw.connection += 0.8;
    if (q.energy === "solitude") raw.reflection += 0.8;
    if (q.energy === "doing") raw.drive += 0.8;
  }

  const dimensions: SelfPortraitDimension[] = Object.entries(raw).map(([key, v]) => ({
    key,
    label: DIM_LABELS[key]!,
    value: clamp(v),
  }));

  const els: [string, number][] = [["wood", wood], ["fire", fire], ["earth", earth], ["metal", metal], ["water", water]];
  const dominantElement = els.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  return { dimensions, dominantElement, note: ELEMENT_NOTE[dominantElement]! };
}
