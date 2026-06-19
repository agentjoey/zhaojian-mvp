/** 天干/地支 ↔ 五行 映射与时辰索引等共享工具。 */

export const STEM_ELEMENT: Record<string, string> = {
  甲: "木", 乙: "木", 丙: "火", 丁: "火", 戊: "土",
  己: "土", 庚: "金", 辛: "金", 壬: "水", 癸: "水",
};

export const BRANCH_ELEMENT: Record<string, string> = {
  子: "水", 丑: "土", 寅: "木", 卯: "木", 辰: "土", 巳: "火",
  午: "火", 未: "土", 申: "金", 酉: "金", 戌: "土", 亥: "水",
};

export const FIVE_ELEMENTS = ["金", "木", "水", "火", "土"] as const;

export function stemElement(stem: string): string {
  return STEM_ELEMENT[stem] ?? "";
}

export function branchElement(branch: string): string {
  return BRANCH_ELEMENT[branch] ?? "";
}

/**
 * 时辰索引（iztro 用，0–12）：00–00:59=子(0)，01–02:59=丑(1)…21–22:59=亥(11)，23–23:59=晚子(12)。
 * ⚠️ iztro 的 0 与 12 同为子时，归日约定差异由各引擎自身处理；金标准交叉验证见 EP-002。
 */
export function hourToTimeIndex(hour: number): number {
  if (hour === 23) return 12;
  return Math.floor((hour + 1) / 2);
}

/** lunar-typescript getYun(gender)：1=男，0=女。 */
export function genderToLunarInt(gender: "male" | "female"): number {
  return gender === "male" ? 1 : 0;
}
