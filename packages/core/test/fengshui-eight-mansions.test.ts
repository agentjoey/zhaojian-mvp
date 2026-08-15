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

  // 最终评审 Blocking 3：震原先只有 4/8 格断言，补满剩余 4 格。
  it("震宅逐格：生气离 天医坎 延年巽 伏位震 / 绝命兑 五鬼乾 六煞艮 祸害坤", () => {
    const z = EIGHT_MANSIONS["震"];
    expect(z.S).toBe("生气");
    expect(z.N).toBe("天医");
    expect(z.SE).toBe("延年");
    expect(z.E).toBe("伏位");
    expect(z.W).toBe("绝命");
    expect(z.NW).toBe("五鬼");
    expect(z.NE).toBe("六煞");
    expect(z.SW).toBe("祸害");
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

  /**
   * 最终评审 Blocking 3：巽/乾/兑三行此前是 0/8——只被「伏位在本卦方位」与
   * 「东西四组」两条结构性测试覆盖，而 spec §5.2 明确警告结构性测试抓不到
   * 六煞↔祸害这类同组内互换（初稿正是在坎/艮/震/离四行之外的这三行出过错）。
   *
   * 下面三组期望值全部独立推导自大游年歌，不看实现代码：
   *   乾六天五祸绝延生 · 巽天五六祸生绝延 · 兑生祸延绝六五天
   * 读法：以坐山为伏位，其余七字按方位顺时针（北→东北→东→东南→南→西南→西→西北，
   * 即 DIRECTIONS 数组顺序）从伏位的下一个方位起依次排。
   * 例：巽坐东南，伏位在 SE；顺时针下一位起依次是 S/SW/W/NW/N/NE/E，
   * 对应歌诀「天五六祸生绝延」→ S=天医 SW=五鬼 W=六煞 NW=祸害 N=生气 NE=绝命 E=延年。
   * 该读法已用坎/艮/离/坤四行（本文件已逐格钉住、且互不依赖实现）反推校验一致，
   * 再据此推算巽/乾/兑——与 packages/core/src/fengshui/eight-mansions.ts 现有实现
   * 逐格比对完全一致，未发现不一致（若未来改动此表导致此处失败，先核对新表是否
   * 仍能通过大游年歌反推，而不是直接改期望值）。
   */
  it("巽宅逐格：生气坎 天医离 延年震 伏位巽 / 绝命艮 五鬼坤 六煞兑 祸害乾", () => {
    const x = EIGHT_MANSIONS["巽"];
    expect(x.N).toBe("生气");
    expect(x.S).toBe("天医");
    expect(x.E).toBe("延年");
    expect(x.SE).toBe("伏位");
    expect(x.NE).toBe("绝命");
    expect(x.SW).toBe("五鬼");
    expect(x.W).toBe("六煞");
    expect(x.NW).toBe("祸害");
  });

  it("乾宅逐格：生气兑 天医艮 延年坤 伏位乾 / 绝命离 五鬼震 六煞坎 祸害巽", () => {
    const q = EIGHT_MANSIONS["乾"];
    expect(q.W).toBe("生气");
    expect(q.NE).toBe("天医");
    expect(q.SW).toBe("延年");
    expect(q.NW).toBe("伏位");
    expect(q.S).toBe("绝命");
    expect(q.E).toBe("五鬼");
    expect(q.N).toBe("六煞");
    expect(q.SE).toBe("祸害");
  });

  it("兑宅逐格：生气乾 天医坤 延年艮 伏位兑 / 绝命震 五鬼离 六煞巽 祸害坎", () => {
    const d = EIGHT_MANSIONS["兑"];
    expect(d.NW).toBe("生气");
    expect(d.SW).toBe("天医");
    expect(d.NE).toBe("延年");
    expect(d.W).toBe("伏位");
    expect(d.E).toBe("绝命");
    expect(d.S).toBe("五鬼");
    expect(d.SE).toBe("六煞");
    expect(d.N).toBe("祸害");
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
