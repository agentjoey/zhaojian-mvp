import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, type BirthInput } from "../src/index";
import { deriveMingGua } from "../src/fengshui/ming-gua";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { deriveCohabitants } from "../src/fengshui/cohabitants";

const mk = (over: Partial<BirthInput>): BirthInput =>
  BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

const person = (id: string, over: Partial<BirthInput>) => {
  const b = mk(over);
  return { profileId: id, name: id, birth: b, chart: computeUnifiedChart(b) };
};

// 1990 男 = 坎1（东四）；1984 男 = 兑7（西四）——刻意取一东一西
const main = person("main", {});
const west = person("west", { date: "1984-06-15" });
const alsoEast = person("east2", { date: "1991-06-15" }); // 离9，东四

describe("EP-fs-13 合看", () => {
  it("每位同住人各自算出命卦，不受主档案影响", () => {
    const c = deriveCohabitants(main, [west, alsoEast]);
    expect(c).toHaveLength(2);
    expect(c[0]!.mingGua.guaName).toBe("兑");
    expect(c[1]!.mingGua.guaName).toBe("离");
  });

  it("conflicts = 对主档案吉、对此人凶的方位（东西异组时必非空）", () => {
    const [w] = deriveCohabitants(main, [west]);
    expect(w!.conflicts.length).toBeGreaterThan(0);
    const mainV = directionsFor(deriveMingGua(main.birth, main.chart).guaName);
    const wV = directionsFor(deriveMingGua(west.birth, west.chart).guaName);
    for (const d of w!.conflicts) {
      expect(mainV[d].auspicious).toBe(true);
      expect(wV[d].auspicious).toBe(false);
    }
  });

  it("东西异组时 sharedGood 为空——四吉方分属两组，无交集", () => {
    const [w] = deriveCohabitants(main, [west]);
    expect(w!.sharedGood).toEqual([]);
  });

  it("同组的两人 sharedGood 非空、conflicts 为空", () => {
    const [e] = deriveCohabitants(main, [alsoEast]);
    expect(e!.sharedGood.length).toBeGreaterThan(0);
    expect(e!.conflicts).toEqual([]);
  });

  it("sharedGood 对所有人都吉（含主档案）", () => {
    const list = deriveCohabitants(main, [west, alsoEast]);
    const mainV = directionsFor(deriveMingGua(main.birth, main.chart).guaName);
    for (const c of list) {
      const cv = directionsFor(c.mingGua.guaName);
      for (const d of c.sharedGood) {
        expect(mainV[d].auspicious).toBe(true);
        expect(cv[d].auspicious).toBe(true);
      }
    }
  });

  it("空列表 → 空结果，不抛错", () => {
    expect(deriveCohabitants(main, [])).toEqual([]);
  });
});
