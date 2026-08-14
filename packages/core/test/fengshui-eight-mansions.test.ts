import { describe, it, expect } from "vitest";
import { DIRECTIONS, GUAS, GUA_DIRECTION } from "../src/fengshui/directions";
import { EIGHT_MANSIONS, directionsFor, AUSPICIOUS_STARS } from "../src/fengshui/eight-mansions";

describe("EP-fs-01 八宅游年表", () => {
  it("8 卦 × 8 方，每卦八星不重复", () => {
    for (const g of GUAS) {
      const row = EIGHT_MANSIONS[g];
      expect(Object.keys(row)).toHaveLength(8);
      expect(new Set(Object.values(row)).size).toBe(8);
    }
  });

  it("伏位恒在本卦方位", () => {
    for (const g of GUAS) {
      expect(EIGHT_MANSIONS[g][GUA_DIRECTION[g]]).toBe("伏位");
    }
  });

  it("每卦四吉四凶各半", () => {
    for (const g of GUAS) {
      const v = directionsFor(g);
      const good = DIRECTIONS.filter((d) => v[d].auspicious);
      expect(good).toHaveLength(4);
    }
  });

  it("坎宅逐格：生气巽 天医震 延年离 伏位坎 / 绝命坤 五鬼艮 六煞乾 祸害兑", () => {
    const k = EIGHT_MANSIONS["坎"];
    expect(k.SE).toBe("生气");
    expect(k.E).toBe("天医");
    expect(k.S).toBe("延年");
    expect(k.N).toBe("伏位");
    expect(k.SW).toBe("绝命");
    expect(k.NE).toBe("五鬼");
    expect(k.NW).toBe("六煞");
    expect(k.W).toBe("祸害");
  });

  // 艮/震/离/坤 四行的六煞与祸害极易互换（同为四凶、同落一组方位，
  // 结构性测试抓不到），故对其中两行逐格断言守护
  it("艮宅逐格：生气坤 天医乾 延年兑 伏位艮 / 绝命巽 五鬼坎 六煞震 祸害离", () => {
    const g = EIGHT_MANSIONS["艮"];
    expect(g.SW).toBe("生气");
    expect(g.NW).toBe("天医");
    expect(g.W).toBe("延年");
    expect(g.NE).toBe("伏位");
    expect(g.SE).toBe("绝命");
    expect(g.N).toBe("五鬼");
    expect(g.E).toBe("六煞");
    expect(g.S).toBe("祸害");
  });

  it("震宅逐格：六煞在艮(东北)、祸害在坤(西南)，二者不可互换", () => {
    const z = EIGHT_MANSIONS["震"];
    expect(z.NE).toBe("六煞");
    expect(z.SW).toBe("祸害");
    expect(z.S).toBe("生气");
    expect(z.N).toBe("天医");
  });

  it("离宅逐格：六煞在坤(西南)、祸害在艮(东北)，二者不可互换", () => {
    const l = EIGHT_MANSIONS["离"];
    expect(l.SW).toBe("六煞");
    expect(l.NE).toBe("祸害");
    expect(l.E).toBe("生气");
    expect(l.SE).toBe("天医");
    expect(l.N).toBe("延年");
    expect(l.S).toBe("伏位");
    expect(l.NW).toBe("绝命");
    expect(l.W).toBe("五鬼");
  });

  it("坤宅逐格：六煞在离(南)、祸害在震(东)，二者不可互换", () => {
    const k = EIGHT_MANSIONS["坤"];
    expect(k.S).toBe("六煞");
    expect(k.E).toBe("祸害");
    expect(k.NE).toBe("生气");
    expect(k.W).toBe("天医");
    expect(k.NW).toBe("延年");
    expect(k.SW).toBe("伏位");
    expect(k.N).toBe("绝命");
    expect(k.SE).toBe("五鬼");
  });

  it("东四命四吉方全落东四方位（坎离震巽）", () => {
    const east = new Set(["N", "S", "E", "SE"]);
    for (const g of ["坎", "离", "震", "巽"] as const) {
      const v = directionsFor(g);
      for (const d of DIRECTIONS) if (v[d].auspicious) expect(east.has(d)).toBe(true);
    }
  });

  it("西四命四吉方全落西四方位（乾兑艮坤）", () => {
    const west = new Set(["NW", "W", "NE", "SW"]);
    for (const g of ["乾", "兑", "艮", "坤"] as const) {
      const v = directionsFor(g);
      for (const d of DIRECTIONS) if (v[d].auspicious) expect(west.has(d)).toBe(true);
    }
  });

  it("生气 rank 最高，伏位最低（吉方内）", () => {
    const v = directionsFor("坎");
    expect(v.SE.rank).toBe(1);
    expect(v.N.rank).toBe(4);
    expect(AUSPICIOUS_STARS).toContain("生气");
  });
});
