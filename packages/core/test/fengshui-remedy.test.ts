import { describe, it, expect } from "vitest";
import { directionsFor } from "../src/fengshui/eight-mansions";
import { elementDirections } from "../src/fengshui/directions";
import { buildPersonalRemedies, sortRemedies, type Remedy } from "../src/fengshui/remedy";
import { ENV_PSYCH_ANCHORS } from "../src/fengshui/env-psych";

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

  // 真实输出里 effort+evidence 全同的条目会并列，顺序全靠这一级决定；
  // 上面那组数据没有任何两条同时在 effort 与 evidence 上打平，覆盖不到
  it("排序第三级：effort 与 evidence 都相同时按 id 升序", () => {
    const mk = (id: string): Remedy => ({
      id, target: "t", action: "x", effort: "零成本",
      tenancy: "租房可做", traditional: "t", modern: "m", evidence: "双重支撑",
    });
    expect(sortRemedies([mk("fs-c"), mk("fs-a"), mk("fs-b")]).map((r) => r.id))
      .toEqual(["fs-a", "fs-b", "fs-c"]);
  });

  it("锚点来源的化解，成本取自锚点声明的 effort，不从文案推断", () => {
    const byId = new Map(list().map((r) => [r.id, r]));
    for (const [i, a] of ENV_PSYCH_ANCHORS.entries()) {
      const r = byId.get(`fs-anchor-${i}`);
      if (r) expect(r.effort).toBe(a.effort);
    }
    // 至少真的取到了一条锚点化解，避免上面循环空转
    expect([...byId.keys()].some((k) => k.startsWith("fs-anchor-"))).toBe(true);
  });

  it("id 唯一", () => {
    const ids = list().map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("EP-fs-12 租房折叠", () => {
  const own: Remedy = {
    id: "fs-own", target: "t", action: "改门", effort: "装修",
    tenancy: "需自有", traditional: "t", modern: null, evidence: "传统象征",
  };
  const rentOk: Remedy = {
    id: "fs-rent", target: "t", action: "挪桌", effort: "挪动",
    tenancy: "租房可做", traditional: "t", modern: "m", evidence: "双重支撑",
  };

  it("租住时「需自有」条目降级排到最后，但不丢弃", () => {
    const sorted = sortRemedies([own, rentOk], { tenancy: "rent" });
    expect(sorted.map((r) => r.id)).toEqual(["fs-rent", "fs-own"]);
    expect(sorted).toHaveLength(2); // 折叠 ≠ 删除
  });

  it("自有时不降级，仍按成本排序（装修在挪动之后）", () => {
    const sorted = sortRemedies([own, rentOk], { tenancy: "own" });
    expect(sorted.map((r) => r.id)).toEqual(["fs-rent", "fs-own"]);
  });

  it("自有时「需自有」的零成本条目能排到「租房可做」的装修条目之前", () => {
    const ownCheap: Remedy = { ...own, id: "fs-own-cheap", effort: "零成本" };
    const rentPricey: Remedy = { ...rentOk, id: "fs-rent-pricey", effort: "装修" };
    expect(sortRemedies([rentPricey, ownCheap], { tenancy: "own" }).map((r) => r.id))
      .toEqual(["fs-own-cheap", "fs-rent-pricey"]);
    // 租住时反过来：需自有的再便宜也排后面
    expect(sortRemedies([rentPricey, ownCheap], { tenancy: "rent" }).map((r) => r.id))
      .toEqual(["fs-rent-pricey", "fs-own-cheap"]);
  });

  it("不传 opts 时行为与波1 完全一致（不按 tenancy 分组）", () => {
    const ownCheap: Remedy = { ...own, id: "a", effort: "零成本" };
    const rentPricey: Remedy = { ...rentOk, id: "b", effort: "装修" };
    expect(sortRemedies([rentPricey, ownCheap]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
