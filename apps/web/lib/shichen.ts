/**
 * 时辰名（子/丑/寅…亥）的展示层小工具——纯显示用，不用于任何排盘计算。
 *
 * 真正的时柱计算走 `packages/core`（`hourToTimeIndex` + 早晚子时归日），本函数
 * 只是给用户一个熟悉的中文时辰名作友好提示，刻意不处理早/晚子时的归日细节——
 * 那属于命理计算，这里只是「07:30 大概是辰时」这种直觉提示。
 */
const SHICHEN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

export function shichenOf(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  if (Number.isNaN(h)) return "";
  const idx = h === 23 ? 0 : Math.floor((h + 1) / 2) % 12;
  return `${SHICHEN[idx]}时`;
}
