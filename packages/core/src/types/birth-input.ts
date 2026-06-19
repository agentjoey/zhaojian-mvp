import { z } from "zod";

/**
 * 用户出生信息输入。产品定位「输入出生信息自动排盘」（非直接输入八字四柱）。
 * 经度 + 时区用于真太阳时校准；早晚子时跨日由 normalize 层处理。
 */
export const BirthInputSchema = z.object({
  /** 阳历或农历日期 YYYY-MM-DD */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 24h HH:MM；未知时辰可传 null（则降级为不带时柱/不画西方宫位）*/
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  /** true=农历输入 */
  isLunar: z.boolean().default(false),
  /** 农历闰月标记 */
  isLeapMonth: z.boolean().default(false),
  gender: z.enum(["male", "female"]),
  /** IANA 时区，用于历史 DST 修正（如中国 1986–1991 夏令时）*/
  timezone: z.string().default("Asia/Shanghai"),
  /** 出生地经度（东正西负），真太阳时校准用 */
  longitude: z.number().min(-180).max(180).optional(),
  /** 出生地纬度，西方本命盘宫位/上升点计算必需 */
  latitude: z.number().min(-90).max(90).optional(),
  /** 是否启用真太阳时校准 */
  trueSolarTime: z.boolean().default(true),
  /** 子时归日约定：'late'=23:00 后算次日（传统）；'early'=当日 */
  ziHourConvention: z.enum(["late", "early"]).default("late"),
  nickname: z.string().max(24).optional(),
});

export type BirthInput = z.infer<typeof BirthInputSchema>;
