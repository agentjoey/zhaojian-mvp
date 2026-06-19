import { z } from "zod";

/**
 * 统一命盘 Schema —— 三套引擎（八字 / 紫微 / 西方本命盘）汇入的跨引擎契约。
 * 这是「确定性计算层」与「LLM 解读层」之间的唯一接口：
 *   排盘引擎只填充此结构；LLM 只读取此结构；严禁 LLM 自行推算星曜/宫位/四化/行星位置。
 *
 * 设计原则（见 research/technical-research.md §4）：
 * - 喂给 LLM 的是「压缩、带标签的事实」，不是库的原始对象。
 * - 每个 system 区块互相独立；synthesis 只做「共振」标注，不做 1:1 等价映射
 *   （见 research/liz-greene-psychological-astrology.md §5「禁止强行 syncretism」）。
 */

// ── 八字 BaZi ──────────────────────────────────────────────
export const PillarSchema = z.object({
  stem: z.string(), // 天干
  branch: z.string(), // 地支
  element: z.string(), // 该柱五行
  tenGodStem: z.string().optional(), // 天干十神
  hiddenStems: z.array(z.string()).default([]), // 地支藏干
});
export type Pillar = z.infer<typeof PillarSchema>;

export const BaziChartSchema = z.object({
  pillars: z.object({
    year: PillarSchema,
    month: PillarSchema,
    day: PillarSchema,
    hour: PillarSchema.nullable(), // 时辰未知时为 null
  }),
  dayMaster: z.string(), // 日主（日柱天干）
  dayMasterElement: z.string(),
  dayMasterStrength: z.enum(["strong", "weak", "balanced", "unknown"]),
  fiveElementCounts: z.record(z.string(), z.number()), // {金,木,水,火,土} 计数
  usefulGod: z.string().optional(), // 用神（可后置计算）
  luckPillars: z
    .array(z.object({ startAge: z.number(), startYear: z.number(), pillar: z.string() }))
    .default([]),
  currentLuckPillar: z.string().optional(),
});
export type BaziChart = z.infer<typeof BaziChartSchema>;

// ── 紫微斗数 Zi Wei Dou Shu ────────────────────────────────
export const StarSchema = z.object({
  name: z.string(),
  brightness: z.string().optional(), // 庙旺得利平不陷
  mutagen: z.enum(["禄", "权", "科", "忌"]).optional(), // 生年四化
});
export type Star = z.infer<typeof StarSchema>;

export const PalaceSchema = z.object({
  name: z.string(), // 命宫/财帛/官禄...
  branch: z.string(),
  isBodyPalace: z.boolean().default(false),
  majorStars: z.array(StarSchema).default([]),
  minorStars: z.array(StarSchema).default([]),
  adjectiveStars: z.array(StarSchema).default([]),
});
export type Palace = z.infer<typeof PalaceSchema>;

export const ZiweiChartSchema = z.object({
  // iztro 安星法：'default'=通行版，'zhongzhou'=中州派
  school: z.enum(["default", "zhongzhou"]).default("zhongzhou"),
  soulPalaceBranch: z.string(), // 命宫地支
  bodyPalaceBranch: z.string(), // 身宫地支
  fiveElementBureau: z.string(), // 五行局
  palaces: z.array(PalaceSchema).length(12),
  /** 生年四化所落星曜 */
  birthMutagens: z.object({
    禄: z.string(),
    权: z.string(),
    科: z.string(),
    忌: z.string(),
  }),
  /** 当前大限/流年（可选，时序解读用）*/
  currentDecadal: z.object({ branch: z.string(), startAge: z.number(), endAge: z.number() }).optional(),
});
export type ZiweiChart = z.infer<typeof ZiweiChartSchema>;

// ── 西方本命盘 Western Natal (Liz Greene 心理层) ─────────────
export const PlanetSchema = z.object({
  name: z.string(), // Sun/Moon/Mercury...
  sign: z.string(), // 星座（表达风格）
  house: z.number().int().min(1).max(12), // 宫位（生活领域）
  degree: z.number(),
  retrograde: z.boolean().default(false),
});
export type Planet = z.infer<typeof PlanetSchema>;

export const AspectSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(["conjunction", "opposition", "trine", "square", "sextile"]),
  orb: z.number(),
  /** hard=square/opposition（内在张力/成长课题）；soft=trine/sextile（天赋流动）*/
  quality: z.enum(["hard", "soft", "neutral"]),
});
export type Aspect = z.infer<typeof AspectSchema>;

export const WesternChartSchema = z.object({
  houseSystem: z.string().default("whole-sign"),
  zodiac: z.enum(["tropical", "sidereal"]).default("tropical"),
  ascendant: z.object({ sign: z.string(), degree: z.number() }),
  midheaven: z.object({ sign: z.string(), degree: z.number() }),
  planets: z.array(PlanetSchema),
  aspects: z.array(AspectSchema),
});
export type WesternChart = z.infer<typeof WesternChartSchema>;

// ── 统一命盘 ──────────────────────────────────────────────
export const UnifiedChartSchema = z.object({
  /** 经真太阳时/子时归一后的实际计算时刻（可审计）*/
  normalizedSolarTime: z.string(),
  bazi: BaziChartSchema,
  ziwei: ZiweiChartSchema,
  /** 时辰或出生地缺失时，西方盘可能为 null（降级）*/
  western: WesternChartSchema.nullable(),
});
export type UnifiedChart = z.infer<typeof UnifiedChartSchema>;
