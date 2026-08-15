import {
  DIRECTIONS, DIRECTION_LABEL,
  type Direction, type FengshuiChart, type FengshuiStar, type Effort, type Remedy,
} from "@eamvp/core";

/**
 * 把 FengshuiChart 压成「带标签的承重事实」（EP-fs-05）。
 * 与 extractFacts 同思路：模型只准引用这里出现的方位与星名，不得自行推算。
 *
 * 防泄漏靠的是**入参类型**而非运行期检查：本函数只能读 `FengshuiChart` 的字段，
 * 而该结构不含出生日期/时间/地点。真正的闸门是 `FENGSHUI_FACT_KEYS` 白名单测试 ——
 * 任何时候给 `FengshuiChart` 加字段（如 Layer 1 的 `dwelling`/`cohabitants`），
 * 不同步白名单就会让白名单测试失败，迫使人显式决定该字段能否进 prompt。
 * 居所事实同样只透传 prompt 需要的标签字段，刻意不带 `id` 等内部标识（见下方类型定义）。
 *
 * 字段类型一律沿用 core 的字面量联合（FengshuiStar / Effort / Remedy["evidence"]），
 * 不放宽成 string —— 拼错星名或成本档位应当编译失败。
 *
 * ⚠️ `remedies` 是**拍平的序列化投影**：core 的 `Remedy` 是判别联合
 * （传统象征 ⇒ modern 恒为 null，编译期强制），投影到这里会丢掉该关联。
 * 这是刻意取舍 —— 此处只做透传，诚实标注由三层守护：
 * ①源头 core `Remedy` 的判别联合 ②prompt 硬规则 ③`sanitizeFengshui` 后置净化。
 */

export type FengshuiFacts = {
  layer: 0 | 1;
  mingGua: string;          // 「坎1（东四命）」
  guaGroup: string;
  bestDirection: string;    // 生气方中文名
  directions: { direction: Direction; label: string; star: FengshuiStar; auspicious: boolean; rank: number }[];
  favorableElements: string[];
  unfavorableElements: string[];
  favorableDirections: string[];
  favorableColors: string[];
  favorableMaterials: string[];
  unfavorableColors: string[];
  remedies: {
    id: string; target: string; action: string; effort: Effort;
    traditional: string; modern: string | null; evidence: Remedy["evidence"];
  }[];
  /** Layer 0 时为 null。刻意不放 id —— 模型不需要、也不该看到内部标识 */
  dwelling: {
    name: string; kind: string; tenancy: string;
    facingLabel: string; sittingLabel: string;
    guaName: string; group: string; matchWithPerson: string;
    sectors: { direction: Direction; label: string; star: FengshuiStar; auspicious: boolean; rank: number }[];
  } | null;
  cohabitants: { name: string; mingGua: string; group: string;
                 conflicts: string[]; sharedGood: string[] }[];
};

/** 可进入 prompt 的字段白名单。新增字段必须同步此处 —— 见白名单测试。 */
export const FENGSHUI_FACT_KEYS = [
  "layer", "mingGua", "guaGroup", "bestDirection", "directions",
  "favorableElements", "unfavorableElements", "favorableDirections",
  "favorableColors", "favorableMaterials", "unfavorableColors", "remedies",
  "dwelling", "cohabitants",
] as const satisfies readonly (keyof FengshuiFacts)[];

export function extractFengshuiFacts(f: FengshuiChart): FengshuiFacts {
  const dirs = DIRECTIONS.map((d) => {
    const v = f.personalDirections[d];
    return { direction: d, label: DIRECTION_LABEL[d], star: v.star, auspicious: v.auspicious, rank: v.rank };
  });
  const sheng = dirs.find((d) => d.star === "生气");
  const dwelling = f.layer === 1 ? {
    name: f.dwelling.name, kind: f.dwelling.kind, tenancy: f.dwelling.tenancy,
    facingLabel: DIRECTION_LABEL[f.dwelling.facing],
    sittingLabel: DIRECTION_LABEL[f.dwelling.sitting],
    guaName: f.dwelling.guaName, group: f.dwelling.group,
    matchWithPerson: f.dwelling.matchWithPerson,
    sectors: DIRECTIONS.map((d) => {
      const v = f.dwelling.sectors[d];
      return { direction: d, label: DIRECTION_LABEL[d], star: v.star, auspicious: v.auspicious, rank: v.rank };
    }),
  } : null;
  const cohabitants = (f.layer === 1 ? f.cohabitants : []).map((c) => ({
    name: c.name, mingGua: `${c.mingGua.guaName}${c.mingGua.gua}`, group: c.mingGua.group,
    conflicts: c.conflicts.map((d) => DIRECTION_LABEL[d]),
    sharedGood: c.sharedGood.map((d) => DIRECTION_LABEL[d]),
  }));
  return {
    layer: f.layer,
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
    dwelling, cohabitants,
  };
}
