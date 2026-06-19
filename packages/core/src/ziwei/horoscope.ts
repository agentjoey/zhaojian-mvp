import { astro } from "iztro";
import type { BirthInput } from "../types/birth-input";
import type { NormalizedBirth } from "../normalize";
import { normalizeBirth } from "../normalize";

/**
 * 紫微大限 / 流年四化（EP-521）：时序解读用，按 date 现算，**不进冻结命盘**。
 * iztro horoscope().decadal / .yearly 的 mutagen 数组顺序为 [禄, 权, 科, 忌]。
 */
export type HoroscopePeriod = {
  stem: string; // 干
  branch: string; // 支
  mutagens: { 禄: string; 权: string; 科: string; 忌: string };
};
export type ZiweiHoroscope = { date: string; decadal: HoroscopePeriod; yearly: HoroscopePeriod };

function toPeriod(p: { heavenlyStem?: string; earthlyBranch?: string; mutagen?: string[] }): HoroscopePeriod {
  const m = p.mutagen ?? [];
  return {
    stem: p.heavenlyStem ?? "",
    branch: p.earthlyBranch ?? "",
    mutagens: { 禄: m[0] ?? "", 权: m[1] ?? "", 科: m[2] ?? "", 忌: m[3] ?? "" },
  };
}

export function computeZiweiHoroscope(
  input: BirthInput,
  dateStr: string,
  pre?: NormalizedBirth,
  algorithm: "default" | "zhongzhou" = "zhongzhou",
): ZiweiHoroscope {
  const n = pre ?? normalizeBirth(input);
  astro.config({ algorithm });
  const a = astro.bySolar(`${n.year}-${n.month}-${n.day}`, n.timeIndex, input.gender, true, "zh-CN");
  const h = a.horoscope(dateStr);
  return { date: dateStr, decadal: toPeriod(h.decadal), yearly: toPeriod(h.yearly) };
}
