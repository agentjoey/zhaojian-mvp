import { describe, it, expect } from "vitest";
import {
  DIRECTIONS, OPPOSITE, GUA_DIRECTION, DIRECTION_GUA, elementDirections,
} from "../src/fengshui/directions";

describe("EP-fs-01 方位基础", () => {
  it("八方位齐全且互为对宫", () => {
    expect(DIRECTIONS).toHaveLength(8);
    for (const d of DIRECTIONS) {
      expect(OPPOSITE[OPPOSITE[d]]).toBe(d);
      expect(OPPOSITE[d]).not.toBe(d);
    }
  });

  it("卦与方位一一对应（坎北 离南 震东 兑西）", () => {
    expect(GUA_DIRECTION["坎"]).toBe("N");
    expect(GUA_DIRECTION["离"]).toBe("S");
    expect(GUA_DIRECTION["震"]).toBe("E");
    expect(GUA_DIRECTION["兑"]).toBe("W");
    for (const d of DIRECTIONS) expect(GUA_DIRECTION[DIRECTION_GUA[d]]).toBe(d);
  });

  it("用神喜木水 → 有利方位含东/东南/北，不利含西/西北", () => {
    const a = elementDirections({ favorable: ["木", "水"], unfavorable: ["金", "火", "土"], method: "扶抑", note: "" });
    expect(a.favorableDirections.sort()).toEqual(["E", "N", "SE"]);
    expect(a.unfavorableDirections).toContain("W");
    expect(a.unfavorableDirections).toContain("NW");
    expect(a.favorableColors.length).toBeGreaterThan(0);
    expect(a.favorableMaterials.length).toBeGreaterThan(0);
  });

  it("中和（喜忌皆空）时不产出方位偏好", () => {
    const a = elementDirections({ favorable: [], unfavorable: [], method: "扶抑", note: "" });
    expect(a.favorableDirections).toEqual([]);
    expect(a.unfavorableDirections).toEqual([]);
  });
});
