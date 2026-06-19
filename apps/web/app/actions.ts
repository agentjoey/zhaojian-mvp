"use server";

import {
  computeUnifiedChart,
  computeDailyFortune,
  BirthInputSchema,
  type UnifiedChart,
  type DailyFortune,
} from "@eamvp/core";

/** 建档排盘：一次性算出完整命盘（EP-007 冻结存档用）。 */
export async function computeChartAction(
  input: unknown,
): Promise<{ ok: true; chart: UnifiedChart } | { ok: false; error: string }> {
  const parsed = BirthInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("；") };
  }
  try {
    return { ok: true, chart: computeUnifiedChart(parsed.data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 运势日历：当日流日 × 命主 → 每日趋吉避祸（EP-008，确定性，lunar 留服务端）。 */
export async function dailyFortuneAction(
  chart: Pick<UnifiedChart, "bazi">,
  dateStr: string,
): Promise<DailyFortune> {
  return computeDailyFortune(chart, dateStr);
}
