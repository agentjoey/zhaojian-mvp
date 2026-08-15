import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui, type BirthInput } from "../src/index";
import { deriveMingGua } from "../src/fengshui/ming-gua";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { DIRECTIONS } from "../src/fengshui/directions";
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

  // ⚠️ 数量必须断言成「恰好 4」而非「大于 0」：八宅恒定四吉四凶各半，且东四/西四
  // 各占 4 个方位，所以东西异组时 conflicts 必然正好是主档案的全部四吉方。
  // 写成 toBeGreaterThan(0) 只能抓「完全没算」，抓不到「少算」——例如把循环边界
  // 写成 DIRECTIONS.slice(0,4) 会静默漏掉一半方位而全部测试照样通过。
  it("conflicts = 对主档案吉、对此人凶的方位（东西异组时恰好 4 个）", () => {
    const [w] = deriveCohabitants(main, [west]);
    expect(w!.conflicts).toHaveLength(4);
    const mainV = directionsFor(deriveMingGua(main.birth, main.chart).guaName);
    const wV = directionsFor(deriveMingGua(west.birth, west.chart).guaName);
    for (const d of w!.conflicts) {
      expect(mainV[d].auspicious).toBe(true);
      expect(wV[d].auspicious).toBe(false);
    }
    // 主档案的四吉方一个不落地全在 conflicts 里
    const mainGood = DIRECTIONS.filter((d) => mainV[d].auspicious);
    expect([...w!.conflicts].sort()).toEqual([...mainGood].sort());
  });

  it("东西异组时 sharedGood 为空——四吉方分属两组，无交集", () => {
    const [w] = deriveCohabitants(main, [west]);
    expect(w!.sharedGood).toEqual([]);
  });

  it("同组的两人 sharedGood 恰好 4 个、conflicts 为空", () => {
    const [e] = deriveCohabitants(main, [alsoEast]);
    expect(e!.sharedGood).toHaveLength(4); // 同组 ⇒ 四吉方完全重合
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

// 上面全部直接调 deriveCohabitants。而「接入 computeFengshui」是本 task 单列的一个
// 交付步骤，此前全仓零覆盖——类型只能保证字段存在，保证不了接线正确
// （硬写 []、或把主档案与同住人的命盘传反，都能通过编译）。
describe("EP-fs-13 合看接入 computeFengshui", () => {
  const dwelling = {
    id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "S" as const,
  };

  it("传 cohabitants → Layer 1 的 cohabitants 与直接调 deriveCohabitants 一致", () => {
    const f = computeFengshui({
      birth: main.birth, chart: main.chart, dwelling, cohabitants: [west, alsoEast],
    });
    expect(f.layer).toBe(1);
    if (f.layer !== 1) throw new Error("unreachable");
    expect(f.cohabitants).toEqual(deriveCohabitants(main, [west, alsoEast]));
    expect(f.cohabitants).toHaveLength(2);
  });

  it("主档案的命盘用作比较基准，不是拿同住人的当基准", () => {
    const f = computeFengshui({
      birth: main.birth, chart: main.chart, dwelling, cohabitants: [west],
    });
    if (f.layer !== 1) throw new Error("unreachable");
    // main=坎(东四)、west=兑(西四)：conflicts 应等于**主档案**的四吉方。
    // 若把基准传反（拿 west 当 main），conflicts 会变成 west 的四吉方，即另一组。
    const mainGood = DIRECTIONS.filter((d) => f.personalDirections[d].auspicious);
    expect([...f.cohabitants[0]!.conflicts].sort()).toEqual([...mainGood].sort());
  });

  it("不传 cohabitants → 空数组（而非 undefined，判别联合要求必填）", () => {
    const f = computeFengshui({ birth: main.birth, chart: main.chart, dwelling });
    if (f.layer !== 1) throw new Error("unreachable");
    expect(f.cohabitants).toEqual([]);
  });

  it("Layer 0（无居所）不含 cohabitants 字段", () => {
    const f = computeFengshui({ birth: main.birth, chart: main.chart });
    expect(f.layer).toBe(0);
    expect(f.cohabitants).toBeUndefined();
  });
});
