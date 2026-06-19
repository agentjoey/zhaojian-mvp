import { Solar } from "lunar-typescript";
import type { BirthInput } from "../types/birth-input";
import type { BaziChart, Pillar } from "../types/chart";
import type { NormalizedBirth } from "../normalize";
import { normalizeBirth } from "../normalize";
import { stemElement, branchElement, FIVE_ELEMENTS, genderToLunarInt } from "../utils/elements";

/**
 * 八字排盘 —— 包装 lunar-typescript (6tail)。见 research/technical-research.md §2。
 * 输入须为已归一的真太阳时（normalizeBirth）；早晚子时归日采用 lunar 默认。
 */
export function computeBaziChart(input: BirthInput, pre?: NormalizedBirth): BaziChart {
  const n = pre ?? normalizeBirth(input);
  const solar = Solar.fromYmdHms(n.year, n.month, n.day, n.hour, n.minute, 0);
  const ec = solar.getLunar().getEightChar();

  const mkPillar = (
    gan: string,
    zhi: string,
    tenGod: string | undefined,
    hide: string[],
  ): Pillar => ({
    stem: gan,
    branch: zhi,
    element: stemElement(gan),
    tenGodStem: tenGod,
    hiddenStems: hide,
  });

  const year = mkPillar(ec.getYearGan(), ec.getYearZhi(), ec.getYearShiShenGan(), ec.getYearHideGan());
  const month = mkPillar(ec.getMonthGan(), ec.getMonthZhi(), ec.getMonthShiShenGan(), ec.getMonthHideGan());
  const day = mkPillar(ec.getDayGan(), ec.getDayZhi(), "日主", ec.getDayHideGan());
  const hour = n.hasTime
    ? mkPillar(ec.getTimeGan(), ec.getTimeZhi(), ec.getTimeShiShenGan(), ec.getTimeHideGan())
    : null;

  // 五行计数：可见的天干 + 地支（时辰未知则 6 个字）
  const counts: Record<string, number> = Object.fromEntries(FIVE_ELEMENTS.map((e) => [e, 0]));
  const visible: Pillar[] = [year, month, day, ...(hour ? [hour] : [])];
  for (const p of visible) {
    counts[stemElement(p.stem)] = (counts[stemElement(p.stem)] ?? 0) + 1;
    counts[branchElement(p.branch)] = (counts[branchElement(p.branch)] ?? 0) + 1;
  }

  // 大运
  const yun = ec.getYun(genderToLunarInt(input.gender));
  const luckPillars = yun.getDaYun(9)
    .filter((dy) => dy.getGanZhi()) // 第 0 步常为空（起运前）
    .map((dy) => ({ startAge: dy.getStartAge(), startYear: dy.getStartYear(), pillar: dy.getGanZhi() }));

  const nowYear = new Date().getUTCFullYear();
  const current = luckPillars
    .slice()
    .reverse()
    .find((lp) => lp.startYear <= nowYear);

  return {
    pillars: { year, month, day, hour },
    dayMaster: ec.getDayGan(),
    dayMasterElement: stemElement(ec.getDayGan()),
    dayMasterStrength: "unknown", // 旺衰判定（用神/调候）留待 EP-004
    fiveElementCounts: counts,
    luckPillars,
    currentLuckPillar: current?.pillar,
  };
}
