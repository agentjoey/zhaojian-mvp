import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, type BirthInput } from "../src/index";
import { deriveMingGua, ganzhiOfYear } from "../src/fengshui/ming-gua";

const mk = (over: Partial<BirthInput>): BirthInput =>
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

const gua = (date: string, gender: "male" | "female", time?: string) => {
  const b = mk({ date, gender, ...(time ? { time } : {}) });
  return deriveMingGua(b, computeUnifiedChart(b));
};

describe("EP-fs-01 本命卦 deriveMingGua", () => {
  it("ganzhiOfYear 基准：1984=甲子", () => {
    expect(ganzhiOfYear(1984)).toBe("甲子");
    expect(ganzhiOfYear(1990)).toBe("庚午");
  });

  // 以下六个值对拍自公开命卦速查表（华易网 k366.com/minggua/、知乎命卦对照表）
  it("1984 男 → 兑7 西四命", () => {
    const g = gua("1984-06-15", "male");
    expect(g.gua).toBe(7);
    expect(g.guaName).toBe("兑");
    expect(g.group).toBe("西四命");
    expect(g.direction).toBe("W");
  });

  it("1990 男 → 坎1 东四命", () => {
    const g = gua("1990-06-15", "male");
    expect(g.gua).toBe(1);
    expect(g.guaName).toBe("坎");
    expect(g.group).toBe("东四命");
  });

  it("1991 男 → 离9；1991 女 → 乾6", () => {
    expect(gua("1991-06-15", "male").gua).toBe(9);
    expect(gua("1991-06-15", "female").gua).toBe(6);
    expect(gua("1991-06-15", "female").guaName).toBe("乾");
  });

  it("1984 女 → 艮8", () => {
    expect(gua("1984-06-15", "female").gua).toBe(8);
    expect(gua("1984-06-15", "female").guaName).toBe("艮");
  });

  it("5 数寄卦：1986 男寄坤2、1990 女寄艮8", () => {
    expect(gua("1986-06-15", "male").gua).toBe(2);
    expect(gua("1986-06-15", "male").guaName).toBe("坤");
    // 1990 女在速查表中即为艮，正好验证「女寄艮」这一支
    expect(gua("1990-06-15", "female").gua).toBe(8);
    expect(gua("1990-06-15", "female").guaName).toBe("艮");
  });

  it("2000 年后无需换式：2000 男→离9、2000 女→乾6", () => {
    expect(gua("2000-06-15", "male").gua).toBe(9);
    expect(gua("2000-06-15", "female").gua).toBe(6);
  });

  it("跨立春取上一年：1981-01-20 按 1980 算 → 坤2 西四命，而非 1981 的坎1 东四命", () => {
    const g = gua("1981-01-20", "male");
    expect(g.lichunYear).toBe(1980);
    expect(g.gua).toBe(2);
    expect(g.group).toBe("西四命");
  });

  it("立春后不回退：1991-03-15 按 1991 算", () => {
    expect(gua("1991-03-15", "male").lichunYear).toBe(1991);
  });

  // 最终评审 Blocking 3：上面 1981-01-20 那个用例远离任何一年的立春（1 月，立春恒在
  // 2 月初），换成同年 1 月哪一天结果都一样，不构成真正的边界考验。2 月 3–5 日才是
  // 每年立春实际落点的窗口（多数年份 2 月 4 日，偶有 2/3 或 2/5）——同一个「2 月 4 日」
  // 在不同年份可能落在立春前或立春后，必须卡在具体年份的具体时刻两侧才有意义。
  //
  // 1996 年立春 = 1996-02-04 21:07（北京时间）。对拍自节气查询站点（huangli123.net /
  // chacd.com 等），并用两条独立的公开命卦速查表交叉核实：1995 年出生男命卦=坤(2)
  // 西四命、1996 年出生男命卦=巽(4) 东四命——与下面两侧的期望值完全吻合。
  it("立春真正的歧义窗口：1996-02-03 与 1996-02-05（跨过 2/4 全天）分属两侧", () => {
    const before = gua("1996-02-03", "male");
    expect(before.lichunYear).toBe(1995);
    expect(before.gua).toBe(2);
    expect(before.guaName).toBe("坤");
    expect(before.group).toBe("西四命");

    const after = gua("1996-02-05", "male");
    expect(after.lichunYear).toBe(1996);
    expect(after.gua).toBe(4);
    expect(after.guaName).toBe("巽");
    expect(after.group).toBe("东四命");
  });

  it("同一天之内也会跨界：1996-02-04 立春准确时刻是 21:07——正午(12:00)仍在立春前，深夜(23:00)已过立春", () => {
    const noon = gua("1996-02-04", "male", "12:00");
    expect(noon.lichunYear).toBe(1995);
    expect(noon.gua).toBe(2);
    expect(noon.group).toBe("西四命");

    const night = gua("1996-02-04", "male", "23:00");
    expect(night.lichunYear).toBe(1996);
    expect(night.gua).toBe(4);
    expect(night.group).toBe("东四命");
  });
});
