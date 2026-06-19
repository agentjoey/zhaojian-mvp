import { Lunar } from "lunar-typescript";
import type { BirthInput } from "./types/birth-input";
import { hourToTimeIndex } from "./utils/elements";

/**
 * 出生信息归一化 —— 三引擎共用的唯一时间真相。
 * 负责：农历→公历、真太阳时经度校准（含历史 DST，经 IANA 时区自动处理）、时辰索引。
 * 输出的 (year..minute) 即三引擎实际使用的「真太阳时」时刻，可审计。
 *
 * 局限（MVP，记入 EP-002）：
 *  - 经度校准只做平太阳时（mean solar time），未含均时差 EoT（±~16 分钟），可能影响临界时辰。
 *  - 早/晚子时归日交由各引擎默认处理，金标准用例待补。
 */
export type NormalizedBirth = {
  year: number;
  month: number; // 1–12（公历）
  day: number;
  hour: number; // 0–23（真太阳时），时辰未知时为 12（午时占位，仅 BaZi 时柱降级用）
  minute: number;
  hasTime: boolean;
  timeIndex: number; // iztro 时辰索引 0–12
  /** 可审计：实际计算时刻描述 */
  normalizedSolarTime: string;
};

/** 计算某 IANA 时区在给定时刻的 UTC 偏移（分钟，正=东于 UTC）。含 DST/历史规则。 */
function tzOffsetMinutes(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = dtf.formatToParts(date).reduce<Record<string, string>>((a, x) => {
    a[x.type] = x.value;
    return a;
  }, {});
  const asUTC = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! === 24 ? 0 : +p.hour!, +p.minute!, +p.second!);
  return Math.round((asUTC - date.getTime()) / 60000);
}

export function normalizeBirth(input: BirthInput): NormalizedBirth {
  const [y, m, d] = input.date.split("-").map(Number) as [number, number, number];
  const hasTime = input.time !== null;
  const [hh, mm] = hasTime
    ? (input.time!.split(":").map(Number) as [number, number])
    : [12, 0]; // 时辰未知 → 占位午时（西方盘会另行降级为 null）

  // 农历 → 公历
  let year = y, month = m, day = d, hour = hh, minute = mm;
  if (input.isLunar) {
    const lunar = Lunar.fromYmdHms(y, input.isLeapMonth ? -m : m, d, hh, mm, 0);
    const solar = lunar.getSolar();
    year = solar.getYear();
    month = solar.getMonth();
    day = solar.getDay();
  }

  let correctionMin = 0;
  if (input.trueSolarTime && input.longitude != null && hasTime) {
    // 真太阳时（平太阳时近似）：标准经线由时区偏移推得；校正 = (经度 − 标准经线)×4 分钟
    const ref = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const offsetMin = tzOffsetMinutes(input.timezone, ref);
    const standardMeridian = (offsetMin / 60) * 15; // 东经为正
    correctionMin = Math.round((input.longitude - standardMeridian) * 4);
  }

  if (correctionMin !== 0) {
    const base = new Date(Date.UTC(year, month - 1, day, hour, minute) + correctionMin * 60000);
    year = base.getUTCFullYear();
    month = base.getUTCMonth() + 1;
    day = base.getUTCDate();
    hour = base.getUTCHours();
    minute = base.getUTCMinutes();
  }

  const timeIndex = hourToTimeIndex(hour);
  const normalizedSolarTime = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}${
    correctionMin ? ` (真太阳时校正 ${correctionMin > 0 ? "+" : ""}${correctionMin}min)` : ""
  }${hasTime ? "" : " [时辰未知]"}`;

  return { year, month, day, hour, minute, hasTime, timeIndex, normalizedSolarTime };
}
