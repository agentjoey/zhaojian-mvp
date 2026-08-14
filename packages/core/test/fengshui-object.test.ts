import { describe, it, expect } from "vitest";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { elementDirections } from "../src/fengshui/directions";
import { adviseObject } from "../src/fengshui/object-advisor";

const base = {
  verdicts: directionsFor("坎"),
  affinity: elementDirections({ favorable: ["木", "水"], unfavorable: ["金", "火", "土"], method: "扶抑", note: "" }),
};

describe("EP-fs-04 物件顾问（弱版）", () => {
  it("原木书桌 → 五行木；推荐方位落在四吉方内", () => {
    const a = adviseObject(base, { category: "desk", material: "原木" });
    expect(a.elementOfObject).toBe("木");
    const good = new Set(["N", "S", "E", "SE"]);
    for (const r of a.recommendedDirections) expect(good.has(r.direction)).toBe(true);
    expect(a.recommendedDirections.length).toBeGreaterThan(0);
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

  it("忌神五行物件 → personalFit 提示节制，且 avoid 非空", () => {
    const a = adviseObject(base, { category: "lamp", material: "金属" });
    expect(a.personalFit).toMatch(/忌|节制|少/);
    expect(a.avoid.length).toBeGreaterThan(0);
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
