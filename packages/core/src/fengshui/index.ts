import type { BirthInput } from "../types/birth-input";
import type { UnifiedChart } from "../types/chart";
import { deriveUsefulElements } from "../bazi/useful-elements";
import { elementDirections, type Direction, type ElementAffinity } from "./directions";
import { deriveMingGua, type MingGua } from "./ming-gua";
import { directionsFor, type DirectionVerdict } from "./eight-mansions";
import { dwellingGua, matchWithPerson, type DwellingInput, type DwellingGua } from "./dwelling";
import { buildPersonalRemedies, buildDwellingRemedies, sortRemedies, type Remedy } from "./remedy";

export * from "./directions";
export * from "./ming-gua";
export * from "./eight-mansions";
export * from "./env-psych";
export * from "./remedy";
export * from "./object-advisor";
export * from "./dwelling";

/** 改动命卦公式 / 游年表 / 化解生成规则时**必须**递增——它进报告指纹，旧报告靠它失效。 */
export const FENGSHUI_ENGINE_VERSION = "fs-2";

export type FengshuiInput = {
  birth: BirthInput;
  chart: UnifiedChart;
  /** 缺省或 facing 未知 = Layer 0 */
  dwelling?: DwellingInput;
};

/** 居所视图 = 宅卦结果 + 用户填的元信息 + 与本人的配合判定 */
export type DwellingView = DwellingGua & {
  id: string;
  name: string;
  kind: "home" | "office";
  tenancy: "rent" | "own";
  matchWithPerson: "相配" | "相冲";
};

type FengshuiChartBase = {
  engineVersion: string;
  mingGua: MingGua;
  personalDirections: Record<Direction, DirectionVerdict>;
  elementAffinity: ElementAffinity;
  remedies: Remedy[];
};

/**
 * 判别联合：**`dwelling` 存在当且仅当 `layer === 1`**，由编译器强制。
 * 用 `layer: 0 | 1` + 可选 `dwelling?` 会放过 `{ layer: 1, dwelling: undefined }` 这种非法状态。
 * 与 `Remedy` / `EnvPsychAnchor` 同一手法。
 */
export type FengshuiChart =
  | (FengshuiChartBase & { layer: 0; dwelling?: undefined; cohabitants?: undefined })
  | (FengshuiChartBase & { layer: 1; dwelling: DwellingView; cohabitants?: undefined });

export function computeFengshui(input: FengshuiInput): FengshuiChart {
  const mingGua = deriveMingGua(input.birth, input.chart);
  const personalDirections = directionsFor(mingGua.guaName);
  const affinity = elementDirections(deriveUsefulElements(input.chart.bazi));
  const personal = buildPersonalRemedies(mingGua, personalDirections, affinity);

  if (!input.dwelling) {
    return {
      layer: 0, engineVersion: FENGSHUI_ENGINE_VERSION,
      mingGua, personalDirections, elementAffinity: affinity,
      remedies: sortRemedies(personal),
    };
  }

  const d = input.dwelling;
  const gua = dwellingGua(d.facing);
  const match = matchWithPerson(mingGua, gua);
  const view: DwellingView = {
    ...gua, id: d.id, name: d.name, kind: d.kind, tenancy: d.tenancy, matchWithPerson: match,
  };
  return {
    layer: 1, engineVersion: FENGSHUI_ENGINE_VERSION,
    mingGua, personalDirections, elementAffinity: affinity,
    dwelling: view,
    remedies: sortRemedies([...personal, ...buildDwellingRemedies(gua, match)], { tenancy: d.tenancy }),
  };
}
