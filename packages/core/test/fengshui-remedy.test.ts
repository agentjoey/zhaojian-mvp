import { describe, it, expect } from "vitest";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { elementDirections } from "../src/fengshui/directions";
import { buildPersonalRemedies, sortRemedies, type Remedy } from "../src/fengshui/remedy";

const mingGua = { gua: 1, guaName: "坎" as const, group: "东四命" as const, direction: "N" as const, lichunYear: 1990 };
const affinity = elementDirections({ favorable: ["木", "水"], unfavorable: ["金", "火", "土"], method: "扶抑", note: "" });
const list = () => buildPersonalRemedies(mingGua, directionsFor("坎"), affinity);

describe("EP-fs-03 化解方案", () => {
  it("产出非空，且每条字段完整", () => {
    const rs = list();
    expect(rs.length).toBeGreaterThanOrEqual(4);
    for (const r of rs) {
      expect(r.id).toBeTruthy();
      expect(r.action).toBeTruthy();
      expect(["零成本", "挪动", "添置", "装修"]).toContain(r.effort);
      expect(["租房可做", "需自有"]).toContain(r.tenancy);
      expect(["双重支撑", "传统象征"]).toContain(r.evidence);
    }
  });

  it("传统象征条目的 modern 恒为 null", () => {
    for (const r of list()) {
      if (r.evidence === "传统象征") expect(r.modern).toBeNull();
    }
  });

  it("含「床头/书桌朝生气方」建议，且指向坎命的生气方东南", () => {
    const hit = list().find((r) => r.action.includes("生气"));
    expect(hit).toBeDefined();
    expect(hit!.action).toContain("东南");
  });

  it("排序：零成本优先；同级内双重支撑先于传统象征", () => {
    const sorted = sortRemedies([
      { id: "a", target: "t", action: "x", effort: "添置", tenancy: "租房可做", traditional: "t", modern: null, evidence: "传统象征" },
      { id: "b", target: "t", action: "y", effort: "零成本", tenancy: "租房可做", traditional: "t", modern: null, evidence: "传统象征" },
      { id: "c", target: "t", action: "z", effort: "零成本", tenancy: "租房可做", traditional: "t", modern: "m", evidence: "双重支撑" },
    ] as Remedy[]);
    expect(sorted.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("id 唯一", () => {
    const ids = list().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
