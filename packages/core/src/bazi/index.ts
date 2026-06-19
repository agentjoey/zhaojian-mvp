import { Solar } from "lunar-typescript";
import type { BirthInput } from "../types/birth-input";
import type { BaziChart, Pillar } from "../types/chart";
import type { NormalizedBirth } from "../normalize";
import { normalizeBirth } from "../normalize";
import { stemElement, branchElement, FIVE_ELEMENTS, genderToLunarInt } from "../utils/elements";

const GENERATES: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
/** 某五行 el 是否「帮扶」日主 dm（同党：比劫 el==dm 或 印 el 生 dm）。 */
function supportsDM(el: string, dm: string): boolean {
  return el === dm || GENERATES[el] === dm;
}

/**
 * 日主旺衰（启发式估计，非用神级精算）：按位置加权统计同党(印+比)占比。
 * 月支权重最高(得令)，日支次之(坐下通根)。≥0.52 强 / ≤0.38 弱 / 其间 中和。
 */
function assessStrength(
  pillars: BaziChart["pillars"],
  dm: string,
): BaziChart["dayMasterStrength"] {
  const items: { el: string; w: number }[] = [
    { el: branchElement(pillars.month.branch), w: 3 }, // 得令
    { el: branchElement(pillars.day.branch), w: 1.5 }, // 坐下
    { el: branchElement(pillars.year.branch), w: 1 },
    { el: stemElement(pillars.year.stem), w: 1 },
    { el: stemElement(pillars.month.stem), w: 1 },
  ];
  if (pillars.hour) {
    items.push({ el: branchElement(pillars.hour.branch), w: 1 });
    items.push({ el: stemElement(pillars.hour.stem), w: 1 });
  }
  let support = 0, total = 0;
  for (const it of items) { total += it.w; if (supportsDM(it.el, dm)) support += it.w; }
  const ratio = total ? support / total : 0;
  return ratio >= 0.52 ? "strong" : ratio <= 0.38 ? "weak" : "balanced";
}

/**
 * 八字排盘 —— 包装 lunar-typescript (6tail)。见 research/technical-research.md §2。
 * 输入须为已归一的真太阳时（normalizeBirth）；晚子时归日按 ziHourConvention 设 lunar sect。
 */
export function computeBaziChart(input: BirthInput, pre?: NormalizedBirth): BaziChart {
  const n = pre ?? normalizeBirth(input);
  const solar = Solar.fromYmdHms(n.year, n.month, n.day, n.hour, n.minute, 0);
  const ec = solar.getLunar().getEightChar();
  // 晚子时(23:xx)归日：'next'→sect1(算次日/子平传统)，'current'→sect2(算当天/默认)
  ec.setSect(input.ziHourConvention === "next" ? 1 : 2);

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

  const pillars = { year, month, day, hour };
  return {
    pillars,
    dayMaster: ec.getDayGan(),
    dayMasterElement: stemElement(ec.getDayGan()),
    dayMasterStrength: assessStrength(pillars, stemElement(ec.getDayGan())),
    fiveElementCounts: counts,
    luckPillars,
    currentLuckPillar: current?.pillar,
  };
}
