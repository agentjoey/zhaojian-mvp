import type { BaziChart } from "../types/chart";
import { deriveStrength } from "./strength";

/**
 * 用神 / 喜忌（EP-501 扶抑法 + EP-002-cal-2 调候）：由日主旺衰推喜用五行，
 * 再叠加月支寒暖的季节微调。
 * 身强 → 喜 食伤/财/官杀（耗泄克）；身弱 → 喜 印/比（生扶）；中和 → 喜流通不取明显扶抑。
 * 调候：冬生（亥子丑月）喜火暖局，夏生（巳午未月）喜水润局；春秋气候相对平和，不作强制微调。
 */

const GENERATES: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const ALL = ["木", "火", "土", "金", "水"];
const WINTER_BRANCHES = new Set(["亥", "子", "丑"]);
const SUMMER_BRANCHES = new Set(["巳", "午", "未"]);

export type UsefulElements = {
  favorable: string[]; // 喜用五行
  unfavorable: string[]; // 忌神五行
  method: "扶抑" | "调候" | "中和";
  note: string;
};

/** 元素 e 相对日主 M 是否为「生扶」党（印 e 生 M，或 比劫 e==M）。 */
function isSupport(e: string, M: string): boolean {
  return e === M || GENERATES[e] === M;
}

/** 月支寒暖调候需求：冬季需火暖局，夏季需水润局；春秋不作强制微调。 */
function climateNeed(monthBranch: string): { element: string; note: string } | null {
  if (WINTER_BRANCHES.has(monthBranch)) return { element: "火", note: "冬季寒冷，调候喜火暖局。" };
  if (SUMMER_BRANCHES.has(monthBranch)) return { element: "水", note: "夏季炎热，调候喜水润局。" };
  return null;
}

export function deriveUsefulElements(chart: BaziChart): UsefulElements {
  const M = chart.dayMasterElement;
  const verdict = deriveStrength(chart).verdict;
  const climate = climateNeed(chart.pillars.month.branch);

  if (verdict === "balanced") {
    const favorable = climate ? [climate.element] : [];
    const note = climate
      ? `日主中和，喜流通调候，不取明显扶抑。${climate.note}`
      : "日主中和，喜流通调候，不取明显扶抑。";
    return { favorable, unfavorable: [], method: climate ? "调候" : "中和", note };
  }

  // 身弱喜生扶(印+比)，身强喜耗泄克(食伤/财/官杀)
  const wantSupport = verdict === "weak";
  const favorable = ALL.filter((e) => isSupport(e, M) === wantSupport);
  const unfavorable = ALL.filter((e) => isSupport(e, M) !== wantSupport);
  let note =
    verdict === "weak"
      ? "日主偏弱，喜印星生身、比劫助身；忌食伤泄、财耗、官杀克。"
      : "日主偏强，喜食伤泄秀、财官制衡；忌印比再添旺气。";

  let method: UsefulElements["method"] = "扶抑";
  if (climate) {
    method = "调候";
    note = `${note}${climate.note}`;
    if (!favorable.includes(climate.element)) favorable.push(climate.element);
    const idx = unfavorable.indexOf(climate.element);
    if (idx >= 0) unfavorable.splice(idx, 1);
  }

  return { favorable, unfavorable, method, note };
}
