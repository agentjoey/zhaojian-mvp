import { DIRECTIONS, DIRECTION_LABEL, type Direction, type FengshuiChart } from "@eamvp/core";

/**
 * 把 FengshuiChart 压成「带标签的承重事实」（EP-fs-05）。
 * 与 extractFacts 同思路：模型只准引用这里出现的方位与星名，不得自行推算。
 * 刻意剔除 PII（出生日期/时间/地点）与中间推导数值。
 */

export type FengshuiFacts = {
  layer: 0;
  mingGua: string;          // 「坎1（东四命）」
  guaGroup: string;
  bestDirection: string;    // 生气方中文名
  directions: { direction: Direction; label: string; star: string; auspicious: boolean; rank: number }[];
  favorableElements: string[];
  unfavorableElements: string[];
  favorableDirections: string[];
  favorableColors: string[];
  favorableMaterials: string[];
  unfavorableColors: string[];
  remedies: {
    id: string; target: string; action: string; effort: string;
    traditional: string; modern: string | null; evidence: string;
  }[];
};

export function extractFengshuiFacts(f: FengshuiChart): FengshuiFacts {
  const dirs = DIRECTIONS.map((d) => {
    const v = f.personalDirections[d];
    return { direction: d, label: DIRECTION_LABEL[d], star: v.star, auspicious: v.auspicious, rank: v.rank };
  });
  const sheng = dirs.find((d) => d.star === "生气");
  return {
    layer: 0,
    mingGua: `${f.mingGua.guaName}${f.mingGua.gua}`,
    guaGroup: f.mingGua.group,
    bestDirection: sheng?.label ?? "",
    directions: dirs,
    favorableElements: f.elementAffinity.favorableElements,
    unfavorableElements: f.elementAffinity.unfavorableElements,
    favorableDirections: f.elementAffinity.favorableDirections.map((d) => DIRECTION_LABEL[d]),
    favorableColors: f.elementAffinity.favorableColors,
    favorableMaterials: f.elementAffinity.favorableMaterials,
    unfavorableColors: f.elementAffinity.unfavorableColors,
    remedies: f.remedies.map((r) => ({
      id: r.id, target: r.target, action: r.action, effort: r.effort,
      traditional: r.traditional, modern: r.modern, evidence: r.evidence,
    })),
  };
}
