import { OPPOSITE, DIRECTION_GUA, type Direction, type Gua } from "./directions";
import { directionsFor, type DirectionVerdict } from "./eight-mansions";
import type { MingGua } from "./ming-gua";

/**
 * 宅卦（EP-fs-12）。与命卦互不相干：命卦由人的立春年+性别定，宅卦由**坐山**定。
 * 坐 = 向的对宫 —— 向南的房子坐北，是坎宅。
 * 宅八方吉凶复用同一张 EIGHT_MANSIONS 查表（`directionsFor`），只是入参换成宅卦。
 */

/**
 * 传给引擎的居所信息。**`facing` 不可为 null** —— 朝向未知就根本不该走到这里。
 * 「不确定」这个状态只存在于 web 层的 `Dwelling`（其 `facing: Direction | null`），
 * 由调用方在边界处判断：facing 为 null 时**不传 dwelling**，直接降级回 Layer 0。
 * 这样引擎侧不必到处处理「有居所但不知朝向」这种半吊子状态。
 */
export type DwellingInput = {
  id: string;
  name: string;
  kind: "home" | "office";
  tenancy: "rent" | "own";
  facing: Direction;
};

const EAST_GROUP = new Set<Gua>(["坎", "离", "震", "巽"]);

export type DwellingGua = {
  facing: Direction;
  sitting: Direction;
  guaName: Gua;
  group: "东四宅" | "西四宅";
  /** 宅卦八方判语——注意这与「命卦八方」是两套，页面上不要混用 */
  sectors: Record<Direction, DirectionVerdict>;
};

export function dwellingGua(facing: Direction): DwellingGua {
  const sitting = OPPOSITE[facing];
  const guaName = DIRECTION_GUA[sitting];
  return {
    facing,
    sitting,
    guaName,
    group: EAST_GROUP.has(guaName) ? "东四宅" : "西四宅",
    sectors: directionsFor(guaName),
  };
}

/** 东四命宜东四宅、西四命宜西四宅。 */
export function matchWithPerson(mingGua: MingGua, dwelling: DwellingGua): "相配" | "相冲" {
  const personEast = mingGua.group === "东四命";
  const dwellingEast = dwelling.group === "东四宅";
  return personEast === dwellingEast ? "相配" : "相冲";
}
