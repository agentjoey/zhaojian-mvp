import type { WesternChart } from "../types/chart";

/**
 * 西方本命盘「心理画像」增强（EP-505）：元素/模式平衡、命主星、月相、星群。
 * 供格林学派解读：元素=心理类型、模式=能量运作、命主星=人格总钥、月相=情感节律。
 */

const SIGN_ORDER = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const ELEMENT: Record<string, "fire" | "earth" | "air" | "water"> = {
  Aries: "fire", Leo: "fire", Sagittarius: "fire",
  Taurus: "earth", Virgo: "earth", Capricorn: "earth",
  Gemini: "air", Libra: "air", Aquarius: "air",
  Cancer: "water", Scorpio: "water", Pisces: "water",
};
const MODALITY: Record<string, "cardinal" | "fixed" | "mutable"> = {
  Aries: "cardinal", Cancer: "cardinal", Libra: "cardinal", Capricorn: "cardinal",
  Taurus: "fixed", Leo: "fixed", Scorpio: "fixed", Aquarius: "fixed",
  Gemini: "mutable", Virgo: "mutable", Sagittarius: "mutable", Pisces: "mutable",
};
const RULER: Record<string, string> = {
  Aries: "Mars", Taurus: "Venus", Gemini: "Mercury", Cancer: "Moon", Leo: "Sun", Virgo: "Mercury",
  Libra: "Venus", Scorpio: "Pluto", Sagittarius: "Jupiter", Capricorn: "Saturn", Aquarius: "Uranus", Pisces: "Neptune",
};
const SIGN_CN: Record<string, string> = {
  Aries: "白羊", Taurus: "金牛", Gemini: "双子", Cancer: "巨蟹", Leo: "狮子", Virgo: "处女",
  Libra: "天秤", Scorpio: "天蝎", Sagittarius: "射手", Capricorn: "摩羯", Aquarius: "水瓶", Pisces: "双鱼",
};
export const MOON_PHASES = ["新月", "娥眉月", "上弦月", "盈凸月", "满月", "亏凸月", "下弦月", "残月"] as const;

export type WesternProfile = {
  elementBalance: { fire: number; earth: number; air: number; water: number };
  modalityBalance: { cardinal: number; fixed: number; mutable: number };
  chartRuler: { planet: string; placement: string };
  moonPhase: string;
  patterns: string[];
};

const lon = (sign: string, degree: number) => (SIGN_ORDER.indexOf(sign) >= 0 ? SIGN_ORDER.indexOf(sign) * 30 + degree : 0);

export function deriveWesternProfile(w: WesternChart): WesternProfile {
  const elementBalance = { fire: 0, earth: 0, air: 0, water: 0 };
  const modalityBalance = { cardinal: 0, fixed: 0, mutable: 0 };
  for (const p of w.planets) {
    const el = ELEMENT[p.sign];
    const md = MODALITY[p.sign];
    if (el) elementBalance[el]++;
    if (md) modalityBalance[md]++;
  }

  // 命主星 = 上升星座守护星 + 其落点
  const rulerName = RULER[w.ascendant.sign] ?? "";
  const rp = w.planets.find((p) => p.name === rulerName);
  const chartRuler = {
    planet: rulerName,
    placement: rp ? `${SIGN_CN[rp.sign] ?? rp.sign} ${rp.house}宫` : "（未落入十星，按守护星象征解读）",
  };

  // 月相：月-日 黄经差（0–360）分八相
  const sun = w.planets.find((p) => p.name === "Sun");
  const moon = w.planets.find((p) => p.name === "Moon");
  let moonPhase = "新月";
  if (sun && moon) {
    const d = (((lon(moon.sign, moon.degree) - lon(sun.sign, sun.degree)) % 360) + 360) % 360;
    moonPhase = MOON_PHASES[Math.floor(d / 45) % 8]!;
  }

  // 星群：≥3 行星同星座 或 同宫
  const patterns: string[] = [];
  const bySign = new Map<string, number>();
  const byHouse = new Map<number, number>();
  for (const p of w.planets) {
    bySign.set(p.sign, (bySign.get(p.sign) ?? 0) + 1);
    byHouse.set(p.house, (byHouse.get(p.house) ?? 0) + 1);
  }
  for (const [sign, n] of bySign) if (n >= 3) patterns.push(`${SIGN_CN[sign] ?? sign}座星群（${n}星）`);
  for (const [house, n] of byHouse) if (n >= 3) patterns.push(`第${house}宫星群（${n}星）`);

  return { elementBalance, modalityBalance, chartRuler, moonPhase, patterns };
}
