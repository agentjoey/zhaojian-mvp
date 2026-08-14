import type { UsefulElements } from "../bazi/useful-elements";

/**
 * 风水方位基础层（EP-fs-01）。纯常量 + 纯映射，无 I/O。
 * 八方位用英文枚举作 key（便于 UI 与序列化），中文名单独查表。
 */

export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const DIRECTION_LABEL: Record<Direction, string> = {
  N: "北", NE: "东北", E: "东", SE: "东南", S: "南", SW: "西南", W: "西", NW: "西北",
};

/** 对宫：坐 = 向的对宫 */
export const OPPOSITE: Record<Direction, Direction> = {
  N: "S", S: "N", E: "W", W: "E", NE: "SW", SW: "NE", SE: "NW", NW: "SE",
};

export const GUAS = ["坎", "坤", "震", "巽", "乾", "兑", "艮", "离"] as const;
export type Gua = (typeof GUAS)[number];

/** 后天八卦定位 */
export const GUA_DIRECTION: Record<Gua, Direction> = {
  坎: "N", 艮: "NE", 震: "E", 巽: "SE", 离: "S", 坤: "SW", 兑: "W", 乾: "NW",
};

export const DIRECTION_GUA: Record<Direction, Gua> = {
  N: "坎", NE: "艮", E: "震", SE: "巽", S: "离", SW: "坤", W: "兑", NW: "乾",
};

/**
 * 五行 → 方位。土在传统上兼主中宫，但中宫不属八方，故只取西南/东北。
 */
export const ELEMENT_DIRECTIONS: Record<string, Direction[]> = {
  木: ["E", "SE"], 火: ["S"], 土: ["SW", "NE"], 金: ["W", "NW"], 水: ["N"],
};

export const ELEMENT_COLORS: Record<string, string[]> = {
  木: ["青", "绿"], 火: ["红", "橙", "紫"], 土: ["黄", "褐", "米"],
  金: ["白", "金", "银灰"], 水: ["黑", "藏蓝"],
};

export const ELEMENT_MATERIALS: Record<string, string[]> = {
  木: ["原木", "棉麻", "绿植"], 火: ["皮革", "暖光", "烛火"], 土: ["陶瓷", "石材", "夯土质感"],
  金: ["金属", "玻璃", "镜面"], 水: ["水景", "流线造型", "深色织物"],
};

export type ElementAffinity = {
  favorableElements: string[];
  unfavorableElements: string[];
  favorableDirections: Direction[];
  unfavorableDirections: Direction[];
  favorableColors: string[];
  favorableMaterials: string[];
  unfavorableColors: string[];
};

const flat = <T,>(els: string[], table: Record<string, T[]>): T[] =>
  Array.from(new Set(els.flatMap((e) => table[e] ?? [])));

/** 用神喜忌五行 → 方位/颜色/材质偏好（EP-fs-02 的数据来源）。 */
export function elementDirections(useful: UsefulElements): ElementAffinity {
  return {
    favorableElements: useful.favorable,
    unfavorableElements: useful.unfavorable,
    favorableDirections: flat(useful.favorable, ELEMENT_DIRECTIONS).sort(),
    unfavorableDirections: flat(useful.unfavorable, ELEMENT_DIRECTIONS).sort(),
    favorableColors: flat(useful.favorable, ELEMENT_COLORS),
    favorableMaterials: flat(useful.favorable, ELEMENT_MATERIALS),
    unfavorableColors: flat(useful.unfavorable, ELEMENT_COLORS),
  };
}
