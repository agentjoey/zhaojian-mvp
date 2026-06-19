import type { BaziChart } from "../types/chart";
import { deriveStrength } from "./strength";

/**
 * 用神 / 喜忌（EP-501，扶抑法）：由日主旺衰推喜用五行。
 * 身强 → 喜 食伤/财/官杀（耗泄克）；身弱 → 喜 印/比（生扶）；中和 → 喜流通不取明显扶抑。
 * v1 仅扶抑；调候（季节微调）记入 note，留 v2。
 */

const GENERATES: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const ALL = ["木", "火", "土", "金", "水"];

export type UsefulElements = {
  favorable: string[]; // 喜用五行
  unfavorable: string[]; // 忌神五行
  method: "扶抑";
  note: string;
};

/** 元素 e 相对日主 M 是否为「生扶」党（印 e 生 M，或 比劫 e==M）。 */
function isSupport(e: string, M: string): boolean {
  return e === M || GENERATES[e] === M;
}

export function deriveUsefulElements(chart: BaziChart): UsefulElements {
  const M = chart.dayMasterElement;
  const verdict = deriveStrength(chart).verdict;

  if (verdict === "balanced") {
    return { favorable: [], unfavorable: [], method: "扶抑", note: "日主中和，喜流通调候，不取明显扶抑。" };
  }

  // 身弱喜生扶(印+比)，身强喜耗泄克(食伤/财/官杀)
  const wantSupport = verdict === "weak";
  const favorable = ALL.filter((e) => isSupport(e, M) === wantSupport);
  const unfavorable = ALL.filter((e) => isSupport(e, M) !== wantSupport);
  const note =
    verdict === "weak"
      ? "日主偏弱，喜印星生身、比劫助身；忌食伤泄、财耗、官杀克。"
      : "日主偏强，喜食伤泄秀、财官制衡；忌印比再添旺气。";
  return { favorable, unfavorable, method: "扶抑", note };
}
