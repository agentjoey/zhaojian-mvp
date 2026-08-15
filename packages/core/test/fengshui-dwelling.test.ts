import { describe, it, expect } from "vitest";
import { DIRECTIONS, OPPOSITE } from "../src/fengshui/directions";
import { dwellingGua, matchWithPerson } from "../src/fengshui/dwelling";
import type { MingGua } from "../src/fengshui/ming-gua";

const mk = (guaName: MingGua["guaName"], group: MingGua["group"]): MingGua =>
  ({ gua: 1, guaName, group, direction: "N", lichunYear: 1990 });

describe("EP-fs-12 宅卦", () => {
  it("坐 = 向的对宫：向南的房子坐北，是坎宅", () => {
    const d = dwellingGua("S");
    expect(d.facing).toBe("S");
    expect(d.sitting).toBe("N");
    expect(d.guaName).toBe("坎");
    expect(d.group).toBe("东四宅");
  });

  it("向北 → 坐南 → 离宅（东四）；向西北 → 坐东南 → 巽宅（东四）", () => {
    expect(dwellingGua("N").guaName).toBe("离");
    expect(dwellingGua("N").group).toBe("东四宅");
    expect(dwellingGua("NW").guaName).toBe("巽");
    expect(dwellingGua("NW").group).toBe("东四宅");
  });

  it("向东南 → 坐西北 → 乾宅（西四）；向东北 → 坐西南 → 坤宅（西四）", () => {
    expect(dwellingGua("SE").guaName).toBe("乾");
    expect(dwellingGua("SE").group).toBe("西四宅");
    expect(dwellingGua("NE").guaName).toBe("坤");
    expect(dwellingGua("NE").group).toBe("西四宅");
  });

  // 前三条只覆盖了 S/N/NW/SE/NE 五个朝向，补齐余下三个——
  // 否则只改坏 E/W/SW 的实现能全绿通过
  it("向东 → 坐西 → 兑宅（西四）；向西 → 坐东 → 震宅（东四）；向西南 → 坐东北 → 艮宅（西四）", () => {
    expect(dwellingGua("E").guaName).toBe("兑");
    expect(dwellingGua("E").group).toBe("西四宅");
    expect(dwellingGua("W").guaName).toBe("震");
    expect(dwellingGua("W").group).toBe("东四宅");
    expect(dwellingGua("SW").guaName).toBe("艮");
    expect(dwellingGua("SW").group).toBe("西四宅");
  });

  it("八个朝向都能算出宅卦，且坐必为向的对宫", () => {
    for (const f of DIRECTIONS) {
      const d = dwellingGua(f);
      expect(d.facing).toBe(f);
      // ⚠️ 不要写成 `dwellingGua(d.sitting).sitting === f`——那条对**恒等函数**同样成立
      // （f(f(x))===x 对对合与恒等都为真），把 sitting=OPPOSITE[facing] 改成 sitting=facing
      // 也照样全绿，等于对「坐向搞反」这个本测试点名要防的 bug 零保护。必须直接比对宫表。
      expect(d.sitting).toBe(OPPOSITE[f]);
      expect(d.sitting).not.toBe(f);
      expect(Object.keys(d.sectors)).toHaveLength(8);
    }
  });

  it("宅八方判语来自宅卦（与命卦无关）：坎宅生气在东南", () => {
    expect(dwellingGua("S").sectors.SE.star).toBe("生气");
  });

  it("东四命住东四宅相配，住西四宅相冲", () => {
    const east = mk("坎", "东四命");
    const west = mk("乾", "西四命");
    expect(matchWithPerson(east, dwellingGua("S"))).toBe("相配");   // 坎宅
    expect(matchWithPerson(west, dwellingGua("S"))).toBe("相冲");
    expect(matchWithPerson(west, dwellingGua("SE"))).toBe("相配");  // 乾宅
    expect(matchWithPerson(east, dwellingGua("SE"))).toBe("相冲");
  });
});
