import type { BirthInput } from "@eamvp/core";

/** ~20 例评测语料：覆盖性别、有/无时辰、不同年代/经纬、农历、子时边界、西方盘降级。 */
export const EVAL_CASES: { id: string; input: Partial<BirthInput> }[] = [
  { id: "shanghai-m-1991", input: { date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 } },
  { id: "beijing-f-1988", input: { date: "1988-07-02", time: "08:15", gender: "female", latitude: 39.9, longitude: 116.4 } },
  { id: "guangzhou-m-1995", input: { date: "1995-11-23", time: "21:40", gender: "male", latitude: 23.13, longitude: 113.26 } },
  { id: "chengdu-f-1979", input: { date: "1979-01-08", time: "05:05", gender: "female", latitude: 30.57, longitude: 104.07 } },
  { id: "harbin-m-2001", input: { date: "2001-06-30", time: "23:30", gender: "male", latitude: 45.8, longitude: 126.53 } }, // 晚子时
  { id: "kunming-f-1983", input: { date: "1983-09-17", time: "12:00", gender: "female", latitude: 25.04, longitude: 102.71 } },
  { id: "no-time-m-1990", input: { date: "1990-05-20", time: null, gender: "male" } }, // 西方盘降级
  { id: "no-time-f-1992", input: { date: "1992-12-01", time: null, gender: "female" } }, // 西方盘降级
  { id: "lunar-m-1986", input: { date: "1986-04-21", time: "16:00", gender: "male", isLunar: true, latitude: 31.23, longitude: 121.47 } },
  { id: "lichun-edge-2024", input: { date: "2024-02-04", time: "10:00", gender: "female", latitude: 31.23, longitude: 121.47 } }, // 立春边界
  { id: "newyork-m-1975", input: { date: "1975-08-09", time: "03:20", gender: "male", latitude: 40.71, longitude: -74.0, timezone: "America/New_York" } },
  { id: "london-f-2003", input: { date: "2003-10-12", time: "18:45", gender: "female", latitude: 51.5, longitude: -0.12, timezone: "Europe/London" } },
  { id: "tokyo-m-1998", input: { date: "1998-02-28", time: "09:50", gender: "male", latitude: 35.68, longitude: 139.69, timezone: "Asia/Tokyo" } },
  { id: "xian-f-1970", input: { date: "1970-03-03", time: "07:00", gender: "female", latitude: 34.34, longitude: 108.94 } },
  { id: "wuhan-m-2008", input: { date: "2008-08-08", time: "20:08", gender: "male", latitude: 30.59, longitude: 114.3 } },
  { id: "early-zi-2000", input: { date: "2000-01-01", time: "00:20", gender: "female", latitude: 31.23, longitude: 121.47 } }, // 早子时
  { id: "shenzhen-m-1993", input: { date: "1993-06-18", time: "11:11", gender: "male", latitude: 22.54, longitude: 114.06 } },
  { id: "hangzhou-f-1985", input: { date: "1985-10-25", time: "15:30", gender: "female", latitude: 30.27, longitude: 120.15 } },
  { id: "noon-m-1965", input: { date: "1965-04-14", time: "12:30", gender: "male", latitude: 31.23, longitude: 121.47 } },
  { id: "lunar-leap-f-2020", input: { date: "2020-04-23", time: "02:00", gender: "female", isLunar: true, isLeapMonth: true, latitude: 39.9, longitude: 116.4 } },
];
