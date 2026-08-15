import type { BirthInput } from "../types/birth-input";
import type { UnifiedChart } from "../types/chart";
import { DIRECTIONS, type Direction } from "./directions";
import { directionsFor } from "./eight-mansions";
import { deriveMingGua, type MingGua } from "./ming-gua";

/**
 * 合看（EP-fs-13）：同一套房子对不同人的吉凶不同 —— 这不是玄学修辞，
 * 而是八宅的直接结论（吉凶由**各人命卦**定，与房子无关）。
 * 实现上只是拿同一批方位对多个档案各跑一遍 `directionsFor`，无额外状态。
 */

export type CohabitantInput = {
  profileId: string;
  name: string;
  birth: BirthInput;
  chart: UnifiedChart;
};

export type Cohabitant = {
  profileId: string;
  name: string;
  mingGua: MingGua;
  /** 对主档案吉、对此人凶 —— 安排共用空间时最需要提醒的方位 */
  conflicts: Direction[];
  /** 对主档案与此人皆吉 —— 共用区域优先选这里 */
  sharedGood: Direction[];
};

export function deriveCohabitants(main: CohabitantInput, list: CohabitantInput[]): Cohabitant[] {
  const mainVerdicts = directionsFor(deriveMingGua(main.birth, main.chart).guaName);
  return list.map((p) => {
    const mingGua = deriveMingGua(p.birth, p.chart);
    const v = directionsFor(mingGua.guaName);
    const conflicts: Direction[] = [];
    const sharedGood: Direction[] = [];
    for (const d of DIRECTIONS) {
      if (mainVerdicts[d].auspicious && !v[d].auspicious) conflicts.push(d);
      if (mainVerdicts[d].auspicious && v[d].auspicious) sharedGood.push(d);
    }
    return { profileId: p.profileId, name: p.name, mingGua, conflicts, sharedGood };
  });
}
