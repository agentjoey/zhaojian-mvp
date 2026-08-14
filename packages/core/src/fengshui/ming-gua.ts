import type { BirthInput } from "../types/birth-input";
import type { UnifiedChart } from "../types/chart";
import { GUA_DIRECTION, type Direction, type Gua } from "./directions";

/**
 * 本命卦（EP-fs-01）。采用三元通行式，与 iztro 显式选派（zhongzhou）同为「选定流派」。
 * ⚠️ 数值由测试锁定；改动公式必须同步重跑 fengshui-ming-gua.test.ts。
 */

const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

/** 公历年 → 干支（1984 = 甲子）。 */
export function ganzhiOfYear(year: number): string {
  const i = ((year - 4) % 60 + 60) % 60;
  return STEMS[i % 10]! + BRANCHES[i % 12]!;
}

/** 卦序 1–9（5 为中宫，需寄卦）→ 卦名。 */
const GUA_BY_NUMBER: Record<number, Gua> = {
  1: "坎", 2: "坤", 3: "震", 4: "巽", 6: "乾", 7: "兑", 8: "艮", 9: "离",
};

const EAST_GROUP = new Set<Gua>(["坎", "离", "震", "巽"]);

export type MingGua = {
  gua: number;
  guaName: Gua;
  group: "东四命" | "西四命";
  direction: Direction;
  /** 实际采用的立春年（可审计，跨立春时为出生公历年 -1）*/
  lichunYear: number;
};

/**
 * 立春年：用已算好的年柱干支在公历年 ±1 窗口内反查。
 * 不重算节气 —— 年柱本就是立春为界，这样与八字引擎天然一致。
 */
function lichunYearOf(birth: BirthInput, chart: UnifiedChart): number {
  const y = Number(birth.date.slice(0, 4));
  const gz = chart.bazi.pillars.year.stem + chart.bazi.pillars.year.branch;
  for (const candidate of [y, y - 1, y + 1]) {
    if (ganzhiOfYear(candidate) === gz) return candidate;
  }
  return y; // 理论不可达；兜底避免抛错
}

/**
 * 三元命卦。直接对立春年 Y 取模，**不需要分 1900s / 2000s 两套式子**：
 *   男 = (2 − Y) mod 9，女 = (Y − 5) mod 9，余 0 归 9。
 * 5 为中宫无卦：男寄坤(2)、女寄艮(8)。
 *
 * 等价于坊间通行的分段写法（男「(100−后两位)÷9 取余」、女「(后两位−4)÷9 取余」），
 * 但把世纪分支消掉了 —— 因 1900 mod 9 = 1、2000 mod 9 = 2，两段折算后同式。
 * 已对拍公开命卦速查表：1984 男兑7/女艮8、1990 男坎1/女艮8、1991 男坎1/女乾6。
 */
function guaNumber(year: number, gender: "male" | "female"): number {
  const raw = gender === "male" ? 2 - year : year - 5;
  let g = ((raw % 9) + 9) % 9;
  if (g === 0) g = 9;
  if (g === 5) g = gender === "male" ? 2 : 8; // 男寄坤、女寄艮
  return g;
}

export function deriveMingGua(birth: BirthInput, chart: UnifiedChart): MingGua {
  const lichunYear = lichunYearOf(birth, chart);
  const gua = guaNumber(lichunYear, birth.gender);
  const guaName = GUA_BY_NUMBER[gua]!;
  return {
    gua,
    guaName,
    group: EAST_GROUP.has(guaName) ? "东四命" : "西四命",
    direction: GUA_DIRECTION[guaName],
    lichunYear,
  };
}
