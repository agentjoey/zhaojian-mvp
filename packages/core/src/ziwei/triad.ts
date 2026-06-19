import type { Palace } from "../types/chart";

/**
 * 三方四正（EP-503）：某宫的本宫 + 三合两宫(+4/+8) + 对宫(+6)，汇集主星（含借星）。
 * 空宫解读须借三方四正之星——把借星算出来喂模型，杜绝凭空臆造。
 * 12 宫成环，相对位置 +4/+6/+8 即对应 三合方/对宫（与排列起点无关）。
 */
export type Triad = { stars: string[]; borrowedFrom: string[]; isEmpty: boolean };

export function deriveTriad(palaces: Palace[], palaceName: string): Triad {
  const i = palaces.findIndex((p) => p.name.includes(palaceName));
  if (i < 0 || palaces.length < 12) return { stars: [], borrowedFrom: [], isEmpty: true };
  const idxs = [i, (i + 4) % 12, (i + 8) % 12, (i + 6) % 12]; // 本宫 / 三合×2 / 对宫
  const stars = [...new Set(idxs.flatMap((k) => palaces[k]!.majorStars.map((s) => s.name)))];
  const borrowedFrom = idxs.slice(1).map((k) => palaces[k]!.name);
  return { stars, borrowedFrom, isEmpty: palaces[i]!.majorStars.length === 0 };
}
