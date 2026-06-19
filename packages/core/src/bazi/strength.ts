import type { BaziChart, Pillar } from "../types/chart";
import { stemElement, branchElement } from "../utils/elements";

/**
 * 日主旺衰「证据化」（EP-502）：不只给单字判词，输出结构化判据，
 * 把通根判断深入到地支藏干（本气/中气/余气，权重 1/0.6/0.3）。
 * 供 extractFacts 喂模型「据证判断」，避免被武断单判误导。
 */

const GENERATES: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
/** el 是否帮扶日主 M（同党：比劫 el==M 或 印 el 生 M）。 */
function supports(el: string, M: string): boolean {
  return el === M || GENERATES[el] === M;
}
const HIDDEN_W = [1, 0.6, 0.3]; // 本气/中气/余气
const round = (n: number) => Math.round(n * 100) / 100;

export type StrengthEvidence = {
  verdict: "strong" | "weak" | "balanced";
  得令: boolean; // 月支主气是否帮扶日主
  roots: { branch: string; via: "比劫" | "印"; weight: number }[]; // 通根（地支藏干见比劫/印）
  同党: number; // 印 + 比劫 加权
  异党: number; // 食伤 + 财 + 官杀 加权
  ratio: number; // 同党 / 总
};

export function deriveStrength(chart: BaziChart): StrengthEvidence {
  const M = chart.dayMasterElement;
  const p = chart.pillars;
  const all: Pillar[] = [p.year, p.month, p.day, ...(p.hour ? [p.hour] : [])];
  const importance = (pl: Pillar) => (pl === p.month ? 2 : pl === p.day ? 1.5 : 1);

  let 同党 = 0;
  let 异党 = 0;

  // 天干（除日主本身）
  for (const pl of [p.year, p.month, ...(p.hour ? [p.hour] : [])]) {
    if (supports(stemElement(pl.stem), M)) 同党 += 1;
    else 异党 += 1;
  }

  // 地支藏干（位置权重 × 宫位权重）；同时记录通根
  const roots: StrengthEvidence["roots"] = [];
  for (const pl of all) {
    const imp = importance(pl);
    let best: { via: "比劫" | "印"; weight: number } | null = null;
    pl.hiddenStems.forEach((hs, i) => {
      const el = stemElement(hs);
      const w = (HIDDEN_W[i] ?? 0.3) * imp;
      if (supports(el, M)) {
        同党 += w;
        const via = el === M ? "比劫" : "印";
        if (!best || w > best.weight) best = { via, weight: round(w) };
      } else {
        异党 += w;
      }
    });
    if (best) roots.push({ branch: pl.branch, ...(best as { via: "比劫" | "印"; weight: number }) });
  }

  const total = 同党 + 异党;
  const ratio = total ? 同党 / total : 0;
  const verdict = ratio >= 0.52 ? "strong" : ratio <= 0.4 ? "weak" : "balanced";
  return { verdict, 得令: supports(branchElement(p.month.branch), M), roots, 同党: round(同党), 异党: round(异党), ratio: round(ratio) };
}
