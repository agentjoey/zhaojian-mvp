// CJS 库：用默认导入 + 解构，兼容 Next/vitest（bundler interop）与 tsx（原生 ESM）
import CNH from "circular-natal-horoscope-js";
const { Origin, Horoscope } = CNH;
import type { BirthInput } from "../types/birth-input";
import type { WesternChart, Planet, Aspect } from "../types/chart";
import type { NormalizedBirth } from "../normalize";
import { normalizeBirth } from "../normalize";

/** 心理占星只取古典十星（含三王星）；恒星/小行星(Sirius/Chiron 等)排除。 */
const PLANETS = [
  "sun", "moon", "mercury", "venus", "mars",
  "jupiter", "saturn", "uranus", "neptune", "pluto",
] as const;

const HARD = new Set(["square", "opposition"]);
const SOFT = new Set(["trine", "sextile"]);

/** 数据质量校验（EP-513）：行星/上升星座不得为空，否则视为排盘失败、降级为 null。 */
export function isWesternValid(chart: WesternChart): boolean {
  if (!chart.ascendant.sign || !chart.midheaven.sign) return false;
  if (chart.planets.length === 0) return false;
  return chart.planets.every((p) => Boolean(p.sign));
}

function withinSign(body: { ChartPosition?: { Ecliptic?: { DecimalDegrees?: number; ArcDegrees?: { degrees: number } } } }): number {
  const deg = body.ChartPosition?.Ecliptic?.DecimalDegrees ?? body.ChartPosition?.Ecliptic?.ArcDegrees?.degrees ?? 0;
  return Math.round((((deg % 30) + 30) % 30) * 100) / 100;
}

/**
 * 西方本命盘 —— 包装 circular-natal-horoscope-js（公有领域，规避 Swiss Ephemeris AGPL）。
 * 见 research/liz-greene-psychological-astrology.md。
 * 缺纬度或时辰未知 → 返回 null（统一盘降级为仅东方双盘）。
 */
export function computeWesternChart(
  input: BirthInput,
  pre?: NormalizedBirth,
  houseSystem = "whole-sign",
): WesternChart | null {
  const n = pre ?? normalizeBirth(input);
  if (!n.hasTime || input.latitude == null || input.longitude == null) return null;

  const origin = new Origin({
    year: n.year,
    month: n.month - 1, // 0-indexed
    date: n.day,
    hour: n.hour,
    minute: n.minute,
    latitude: input.latitude,
    longitude: input.longitude,
  });
  const h = new Horoscope({
    origin,
    houseSystem,
    zodiac: "tropical",
    aspectTypes: ["major"],
    language: "en",
  });

  const planets: Planet[] = PLANETS.map((key) => {
    const b = h.CelestialBodies[key];
    return b
      ? {
          name: b.label ?? key,
          sign: b.Sign?.label ?? "",
          house: (b.House?.id ?? 1) as number,
          degree: withinSign(b),
          retrograde: b.isRetrograde ?? false,
        }
      : null;
  }).filter((p): p is Planet => p !== null);

  const includedLabels = new Set(planets.map((p) => p.name.toLowerCase()));
  const aspects: Aspect[] = (h.Aspects.all ?? [])
    .map((a): Aspect | null => {
      const from = (a.point1Label ?? "").toLowerCase();
      const to = (a.point2Label ?? "").toLowerCase();
      if (!includedLabels.has(from) || !includedLabels.has(to)) return null;
      const type = (a.aspectKey ?? a.label ?? "").toLowerCase();
      if (!["conjunction", "opposition", "trine", "square", "sextile"].includes(type)) return null;
      return {
        from: a.point1Label ?? "",
        to: a.point2Label ?? "",
        type: type as Aspect["type"],
        orb: Math.round((a.orb ?? 0) * 100) / 100,
        quality: HARD.has(type) ? "hard" : SOFT.has(type) ? "soft" : "neutral",
      };
    })
    .filter((a): a is Aspect => a !== null);

  const chart: WesternChart = {
    houseSystem,
    zodiac: "tropical",
    ascendant: { sign: h.Ascendant.Sign?.label ?? "", degree: withinSign(h.Ascendant) },
    midheaven: { sign: h.Midheaven.Sign?.label ?? "", degree: withinSign(h.Midheaven) },
    planets,
    aspects,
  };
  if (!isWesternValid(chart)) {
    console.warn("[western] 排盘数据不完整（星座为空），降级为 null");
    return null;
  }
  return chart;
}
