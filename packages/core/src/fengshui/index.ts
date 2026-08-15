import type { BirthInput } from "../types/birth-input";
import type { UnifiedChart } from "../types/chart";
import { deriveUsefulElements } from "../bazi/useful-elements";
import { elementDirections, type Direction, type ElementAffinity } from "./directions";
import { deriveMingGua, type MingGua } from "./ming-gua";
import { directionsFor, type DirectionVerdict } from "./eight-mansions";
import { buildPersonalRemedies, type Remedy } from "./remedy";

export * from "./directions";
export * from "./ming-gua";
export * from "./eight-mansions";
export * from "./env-psych";
export * from "./remedy";
export * from "./object-advisor";

/**
 * 风水引擎版本。改动命卦公式 / 游年表 / 化解生成规则时**必须**递增，
 * 用于让 web 端 localStorage 报告缓存自动失效。
 */
export const FENGSHUI_ENGINE_VERSION = "fs-1";

export type FengshuiInput = {
  birth: BirthInput;
  chart: UnifiedChart;
};

export type FengshuiChart = {
  layer: 0;
  engineVersion: string;
  mingGua: MingGua;
  personalDirections: Record<Direction, DirectionVerdict>;
  elementAffinity: ElementAffinity;
  remedies: Remedy[];
  /** Layer 1 起才有；波 1 恒为 undefined */
  dwelling?: undefined;
  cohabitants?: undefined;
};

/**
 * 风水派生层顶层入口（Layer 0）。纯函数，可按 (birth, chart) 缓存。
 * 与 deriveSpirit 同层 —— 不进冻结命盘、不改 UnifiedChart。
 */
export function computeFengshui(input: FengshuiInput): FengshuiChart {
  const mingGua = deriveMingGua(input.birth, input.chart);
  const personalDirections = directionsFor(mingGua.guaName);
  const affinity = elementDirections(deriveUsefulElements(input.chart.bazi));
  return {
    layer: 0,
    engineVersion: FENGSHUI_ENGINE_VERSION,
    mingGua,
    personalDirections,
    elementAffinity: affinity,
    remedies: buildPersonalRemedies(mingGua, personalDirections, affinity),
  };
}
