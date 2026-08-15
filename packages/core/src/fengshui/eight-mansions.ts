import { DIRECTIONS, GUA_DIRECTION, type Direction, type Gua } from "./directions";

/**
 * 八宅游年表（EP-fs-01）。四吉：生气/天医/延年/伏位；四凶：绝命/五鬼/六煞/祸害。
 * 游年翻卦的结果直接硬编码为查表 —— 零推算歧义、逐格可测，
 * 落实「排盘不许 LLM 算」（见 CLAUDE.md）。
 */

export const AUSPICIOUS_STARS = ["生气", "天医", "延年", "伏位"] as const;
export const INAUSPICIOUS_STARS = ["绝命", "五鬼", "六煞", "祸害"] as const;
export type Star = (typeof AUSPICIOUS_STARS)[number] | (typeof INAUSPICIOUS_STARS)[number];

/**
 * 吉方排序（越小越吉）；凶方排序（越小越凶）。
 * 用 Record<Star, number> 而非 Record<string, number>：让编译器强制八星齐全，
 * 键名写错会编译失败，而不是运行期悄悄拿到 undefined。
 */
const STAR_RANK: Record<Star, number> = {
  生气: 1, 天医: 2, 延年: 3, 伏位: 4,
  绝命: 1, 五鬼: 2, 六煞: 3, 祸害: 4,
};

/**
 * 以「卦 → 各星所在卦」表达，再展开为方位表。
 *
 * 依据大游年歌（以坐山为伏位，其余七字**按方位顺时针**依次排）：
 *   乾六天五祸绝延生 · 坎五天生延绝祸六 · 艮六绝祸生延天五 · 震延生祸绝五天六
 *   巽天五六祸生绝延 · 离六五绝延祸生天 · 坤天延绝生祸五六 · 兑生祸延绝六五天
 * 简写：生=生气 天=天医 延=延年 五=五鬼 六=六煞 祸=祸害 绝=绝命。
 * 顺时针方位序：北 → 东北 → 东 → 东南 → 南 → 西南 → 西 → 西北。
 *
 * ⚠️ 已逐格对拍（2026-08-14）。六煞与祸害同为四凶且同落一组方位，
 *    「四吉方全落本组」的结构性测试**抓不到二者互换**，故本表只能靠逐格断言守护。
 */
const BY_STAR: Record<Gua, Record<Star, Gua>> = {
  坎: { 生气: "巽", 天医: "震", 延年: "离", 伏位: "坎", 绝命: "坤", 五鬼: "艮", 六煞: "乾", 祸害: "兑" },
  离: { 生气: "震", 天医: "巽", 延年: "坎", 伏位: "离", 绝命: "乾", 五鬼: "兑", 六煞: "坤", 祸害: "艮" },
  震: { 生气: "离", 天医: "坎", 延年: "巽", 伏位: "震", 绝命: "兑", 五鬼: "乾", 六煞: "艮", 祸害: "坤" },
  巽: { 生气: "坎", 天医: "离", 延年: "震", 伏位: "巽", 绝命: "艮", 五鬼: "坤", 六煞: "兑", 祸害: "乾" },
  乾: { 生气: "兑", 天医: "艮", 延年: "坤", 伏位: "乾", 绝命: "离", 五鬼: "震", 六煞: "坎", 祸害: "巽" },
  兑: { 生气: "乾", 天医: "坤", 延年: "艮", 伏位: "兑", 绝命: "震", 五鬼: "离", 六煞: "巽", 祸害: "坎" },
  艮: { 生气: "坤", 天医: "乾", 延年: "兑", 伏位: "艮", 绝命: "巽", 五鬼: "坎", 六煞: "震", 祸害: "离" },
  坤: { 生气: "艮", 天医: "兑", 延年: "乾", 伏位: "坤", 绝命: "坎", 五鬼: "巽", 六煞: "离", 祸害: "震" },
};

function expand(row: Record<Star, Gua>): Record<Direction, Star> {
  const out = {} as Record<Direction, Star>;
  for (const [star, gua] of Object.entries(row) as [Star, Gua][]) {
    out[GUA_DIRECTION[gua]] = star;
  }
  return out;
}

export const EIGHT_MANSIONS: Record<Gua, Record<Direction, Star>> = {
  坎: expand(BY_STAR.坎), 离: expand(BY_STAR.离), 震: expand(BY_STAR.震), 巽: expand(BY_STAR.巽),
  乾: expand(BY_STAR.乾), 兑: expand(BY_STAR.兑), 艮: expand(BY_STAR.艮), 坤: expand(BY_STAR.坤),
};

export type DirectionVerdict = {
  direction: Direction;
  star: Star;
  auspicious: boolean;
  /** 吉方 1–4（1 最吉）；凶方 1–4（1 最凶）*/
  rank: number;
};

export function directionsFor(gua: Gua): Record<Direction, DirectionVerdict> {
  const row = EIGHT_MANSIONS[gua];
  const out = {} as Record<Direction, DirectionVerdict>;
  for (const d of DIRECTIONS) {
    const star = row[d];
    const auspicious = (AUSPICIOUS_STARS as readonly string[]).includes(star);
    out[d] = { direction: d, star, auspicious, rank: STAR_RANK[star] };
  }
  return out;
}
