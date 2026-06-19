import type { ChartFacts } from "../facts";

/**
 * 接地性词表 —— 用于检测解读是否引用了「不在事实 JSON 里」的星曜（幻觉）。
 *
 * ⚠️ 已知局限（v1，诚实记录）：
 *  - 「太阳」「火星」在紫微星曜与西方行星（Sun/Mars）中**同名冲突**，无法靠词面区分声部，
 *    故从紫微接地词表中**剔除**这两个，只校验其余区分度高的星曜（覆盖绝大多数幻觉风险）。
 *  - 词表为子串匹配，可能漏检「巨门」被拆写等极端情况；作为护栏而非证明。
 */

// 紫微可被接地校验的星曜（剔除与西方行星同名的 太阳/火星）
export const ZIWEI_STARS = [
  "紫微", "天机", "武曲", "天同", "廉贞",
  "天府", "太阴", "贪狼", "巨门", "天相", "天梁", "七杀", "破军",
  "左辅", "右弼", "文昌", "文曲", "天魁", "天钺",
  "擎羊", "陀罗", "铃星", "地空", "地劫", "禄存", "天马",
] as const;

// 可携带四化的星（14 主星 + 文昌文曲左辅右弼）—— 四化检测/纠正共用
export const MUTAGEN_STARS = [
  "紫微", "天机", "太阳", "武曲", "天同", "廉贞", "天府", "太阴", "贪狼", "巨门", "天相", "天梁", "七杀", "破军",
  "文昌", "文曲", "左辅", "右弼",
] as const;

// 西方行星（中文名）—— 用于「西方盘缺失却谈行星」的越界检测
export const WESTERN_PLANET_ZH = [
  "月亮", "水星", "金星", "木星", "土星", "天王星", "海王星", "冥王星", "上升", "中天",
] as const;

// 12 西方星座（中文）—— 同上越界检测
export const WESTERN_SIGN_ZH = [
  "白羊", "金牛", "双子", "巨蟹", "狮子", "处女",
  "天秤", "天蝎", "射手", "摩羯", "水瓶", "双鱼",
] as const;

/** 该命盘事实里实际出现过的紫微星曜集合（模型被允许引用的星）。*/
export function allowedZiweiStars(facts: ChartFacts): Set<string> {
  const blob = JSON.stringify(facts.ziwei);
  return new Set(ZIWEI_STARS.filter((s) => blob.includes(s)));
}

/** 解读文本中提到的、可校验的紫微星曜。*/
export function mentionedZiweiStars(text: string): string[] {
  return ZIWEI_STARS.filter((s) => text.includes(s));
}
