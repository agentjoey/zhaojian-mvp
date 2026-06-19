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

/** 地名 → 经纬度 + 时区（OpenStreetMap Nominatim + tz-lookup）。用于出生地输入。 */
export type GeoResult = { label: string; lat: number; lon: number; timezone: string };
export async function geocodeAction(
  query: string,
): Promise<{ ok: true; results: GeoResult[] } | { ok: false; error: string }> {
  const q = query.trim();
  if (!q) return { ok: false, error: "请输入出生地" };
  try {
    const tzlookup = (await import("tz-lookup")).default;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&accept-language=zh`;
    const res = await fetch(url, { headers: { "User-Agent": "zhaojian-mvp/0.1 (eastern astrology self-reflection)" } });
    if (!res.ok) return { ok: false, error: `地理编码失败（${res.status}）` };
    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const results: GeoResult[] = data.map((d) => {
      const lat = Number(d.lat), lon = Number(d.lon);
      let timezone = "Asia/Shanghai";
      try { timezone = tzlookup(lat, lon); } catch { /* fallback */ }
      return { label: d.display_name, lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, timezone };
    });
    if (results.length === 0) return { ok: false, error: "未找到该地点，请换个说法或填更具体的城市" };
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
