import { describe, it, expect } from "vitest";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { elementDirections } from "../src/fengshui/directions";
import { adviseObject } from "../src/fengshui/object-advisor";

const base = {
  verdicts: directionsFor("坎"),
  affinity: elementDirections({ favorable: ["木", "水"], unfavorable: ["金", "火", "土"], method: "扶抑", note: "" }),
};

describe("EP-fs-04 物件顾问（弱版）", () => {
  // 坎命四吉方 = {SE 生气, E 天医, S 延年, N 伏位}
  it("原木书桌 → 五行木；推荐方位收窄到「木方位 ∩ 四吉方」= 东、东南", () => {
    const a = adviseObject(base, { category: "desk", material: "原木" });
    expect(a.elementOfObject).toBe("木");
    // 断言恰好是交集本身，而非仅「落在四吉方内」——后者在退回分支下同样成立，
    // 删掉交集逻辑也测不出来
    expect(a.recommendedDirections.map((r) => r.direction).sort()).toEqual(["E", "SE"]);
    for (const r of a.recommendedDirections) expect(r.reason).toContain("同气");
  });

  it("交集为空时退回四吉方：金属物件（金主西/西北）对坎命无交集，仍给出吉方建议", () => {
    const a = adviseObject(base, { category: "lamp", material: "金属" });
    expect(a.elementOfObject).toBe("金");
    const dirs = a.recommendedDirections.map((r) => r.direction);
    // 金的方位 W/NW 全是坎命凶方 → 必须退回四吉方，且不得谎称「同气」
    expect(dirs).not.toContain("W");
    expect(dirs).not.toContain("NW");
    expect(dirs.length).toBe(3);
    for (const d of dirs) expect(["N", "S", "E", "SE"]).toContain(d);
    for (const r of a.recommendedDirections) expect(r.reason).not.toContain("同气");
  });

  it("镜子命中「不对床」硬规则", () => {
    const a = adviseObject(base, { category: "mirror" });
    expect(a.categoryRules.join("")).toContain("床");
  });

  it("鱼缸命中「忌卧室」硬规则", () => {
    const a = adviseObject(base, { category: "aquarium" });
    expect(a.categoryRules.join("")).toContain("卧室");
  });

  it("形状可定五行：尖锐→火，圆→金，波浪→水", () => {
    expect(adviseObject(base, { category: "art", shape: "尖锐" }).elementOfObject).toBe("火");
    expect(adviseObject(base, { category: "art", shape: "圆" }).elementOfObject).toBe("金");
    expect(adviseObject(base, { category: "art", shape: "波浪" }).elementOfObject).toBe("水");
  });

  it("材质优先于形状", () => {
    expect(adviseObject(base, { category: "art", material: "金属", shape: "波浪" }).elementOfObject).toBe("金");
  });

  it("五行是否为忌神只影响 personalFit，不改变 avoid 列表", () => {
    const unfav = adviseObject(base, { category: "lamp", material: "金属" }); // 金 = 忌神
    const fav = adviseObject(base, { category: "lamp", material: "原木" }); // 木 = 喜用
    expect(unfav.personalFit).toMatch(/忌|节制|少/);
    expect(fav.personalFit).toMatch(/喜用|放心/);
    // avoid 只由命卦四凶方决定，与物件五行无关；断言两者相同，
    // 比断言「avoid 非空」有意义——后者对任何输入都恒真
    expect(unfav.avoid).toEqual(fav.avoid);
  });

  it("指定 intendedDirection 时给出该方位的判语", () => {
    const a = adviseObject(base, { category: "desk", material: "原木", intendedDirection: "SW" });
    expect(a.intendedVerdict).toBeTruthy();
    expect(a.intendedVerdict!.star).toBe("绝命");
  });

  it("未知材质与形状 → 五行为 null，但仍给出方位建议", () => {
    const a = adviseObject(base, { category: "other" });
    expect(a.elementOfObject).toBeNull();
    expect(a.recommendedDirections.length).toBeGreaterThan(0);
  });
});
