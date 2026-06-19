import type { Relation } from "@eamvp/core";

/**
 * 运势配图库（EP-cal-img · A 混合制）。
 * AI 预生成 → 人工/agent 筛图(见 skill curate-fortune-images) → 打标签存仓库 public/fortune/ → 规则选图。
 * 每张图带「意境标签」：与当日命理流日的情绪一致，形成心理暗示。
 * 当前为静态清单 + 仓库内图片；日后量大可把 file 换成 CDN/Storage URL（matchFortuneImage 不变）。
 */
export type FortuneImage = {
  file: string; // 相对 public，如 /fortune/guansha-1.jpeg
  /** 适配的十神情绪（可多选）—— 主匹配维度，确保意境一致 */
  moods: Relation[];
  /** 适配五行（可选，软匹配） */
  elements?: ("木" | "火" | "土" | "金" | "水")[];
  /** 意境标签文案（一句，作心理暗示，配在图下） */
  caption: string;
  alt: string;
};

/** 十神情绪 → 该日主题词（与 computeDailyFortune 的关系语义一致）。 */
export const MOOD_LABEL: Record<Relation, string> = {
  比和: "协作同行",
  印: "休整蓄力",
  食伤: "表达抒发",
  财: "行动掌控",
  官杀: "守静自持",
};

/** 策展后的图库清单（由 skill curate-fortune-images 维护）。seed: 2026-06-19 首批 10 张，纯水墨。 */
export const FORTUNE_IMAGES: FortuneImage[] = [
  { file: "/fortune/bihe-1.jpeg", moods: ["比和"], caption: "双峰并峙，今日宜与人同行、稳中共进", alt: "水墨双峰并峙于云海" },
  { file: "/fortune/bihe-2.jpeg", moods: ["比和"], caption: "孤帆相随，今日宜携手、不必独行", alt: "水墨二帆同向远行" },
  { file: "/fortune/yin-1.jpeg", moods: ["印"], caption: "深山幽栖，今日宜养息、近师友", alt: "水墨深山幽谷草庐" },
  { file: "/fortune/yin-2.jpeg", moods: ["印"], caption: "平湖印月，今日宜静心、蓄力以待", alt: "水墨平湖之上淡月" },
  { file: "/fortune/shishang-1.jpeg", moods: ["食伤"], caption: "飞鸟掠空，今日宜抒怀、轻声表达", alt: "水墨群鸟掠过水面" },
  { file: "/fortune/shishang-2.jpeg", moods: ["食伤"], caption: "寒林独立，今日宜沉淀、把心绪落成形", alt: "水墨疾风过寒林" },
  { file: "/fortune/cai-1.jpeg", moods: ["财"], caption: "孤舟破雾，今日宜把握节奏、主动前行", alt: "水墨孤舟破雾前行" },
  { file: "/fortune/cai-2.jpeg", moods: ["财"], caption: "长河一帆，今日宜务实、循势而动", alt: "水墨长河尽头远帆" },
  { file: "/fortune/guansha-1.jpeg", moods: ["官杀"], caption: "孤峰独峙，今日宜守静、克己自持", alt: "水墨孤峰独峙寒江" },
  { file: "/fortune/guansha-2.jpeg", moods: ["官杀"], caption: "寒江独钓，今日宜安住、以静制动", alt: "水墨寒江独钓" },
  // —— 扩库 2026-06-19（curate-fortune-images，再 10 张，每情绪共 4 张）——
  { file: "/fortune/bihe-3.jpeg", moods: ["比和"], caption: "群山相连，今日宜借众力、不必孤军", alt: "水墨群山连绵层叠" },
  { file: "/fortune/bihe-4.jpeg", moods: ["比和"], caption: "双鹤齐飞，今日宜同心、并肩而进", alt: "水墨双鹤并翼同飞" },
  { file: "/fortune/yin-3.jpeg", moods: ["印"], caption: "古松独立，今日宜守拙、沉静自养", alt: "水墨崖畔古松" },
  { file: "/fortune/yin-4.jpeg", moods: ["印"], caption: "云深藏寺，今日宜内省、远嚣养神", alt: "水墨云深处山寺" },
  { file: "/fortune/shishang-3.jpeg", moods: ["食伤"], caption: "雁字横空，今日宜舒展、顺势抒怀", alt: "水墨远雁斜过长空" },
  { file: "/fortune/shishang-4.jpeg", moods: ["食伤"], caption: "飞瀑入涧，今日宜倾吐、让郁气流动", alt: "水墨飞瀑落涧" },
  { file: "/fortune/cai-3.jpeg", moods: ["财"], caption: "策杖登高，今日宜进取、循径而上", alt: "水墨策杖独行登山" },
  { file: "/fortune/cai-4.jpeg", moods: ["财"], caption: "大江扬帆，今日宜乘势、放眼远处", alt: "水墨大江千帆过尽" },
  { file: "/fortune/guansha-3.jpeg", moods: ["官杀"], caption: "雪覆寒山，今日宜潜藏、静待时机", alt: "水墨深雪寒山一径" },
  { file: "/fortune/guansha-4.jpeg", moods: ["官杀"], caption: "雪亭独对，今日宜安守、不妄动", alt: "水墨雪中孤亭" },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * 按当日流日选一张配图：先按情绪(relation)匹配，命中多张则按日期确定性轮选（同一天稳定）。
 * 无匹配则在全库回退。库为空返回 null（UI 降级不显示）。
 */
export function matchFortuneImage(relation: Relation, dateStr: string): FortuneImage | null {
  if (FORTUNE_IMAGES.length === 0) return null;
  const pool = FORTUNE_IMAGES.filter((i) => i.moods.includes(relation));
  const list = pool.length ? pool : FORTUNE_IMAGES;
  return list[hashStr(dateStr) % list.length] ?? null;
}
