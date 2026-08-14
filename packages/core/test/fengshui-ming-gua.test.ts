import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, type BirthInput } from "../src/index";
import { deriveMingGua, ganzhiOfYear } from "../src/fengshui/ming-gua";

const mk = (over: Partial<BirthInput>): BirthInput =>
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

const gua = (date: string, gender: "male" | "female") => {
  const b = mk({ date, gender });
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
});
