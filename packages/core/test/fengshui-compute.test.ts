import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui, FENGSHUI_ENGINE_VERSION, type BirthInput } from "../src/index";

const mk = (over: Partial<BirthInput> = {}): BirthInput =>
  BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false, ...over });

const run = (over: Partial<BirthInput> = {}) => {
  const b = mk(over);
  return computeFengshui({ birth: b, chart: computeUnifiedChart(b) });
};

describe("EP-fs-03 computeFengshui Layer 0", () => {
  it("layer 恒为 0，且不含 dwelling / cohabitants", () => {
    const f = run();
    expect(f.layer).toBe(0);
    expect(f.dwelling).toBeUndefined();
    expect(f.cohabitants).toBeUndefined();
  });

  it("命卦、八方判语、用神方位、化解齐备", () => {
    const f = run();
    expect(f.mingGua.guaName).toBe("坎");
    expect(Object.keys(f.personalDirections)).toHaveLength(8);
    expect(f.elementAffinity.favorableElements.length).toBeGreaterThan(0);
    expect(f.remedies.length).toBeGreaterThanOrEqual(4);
  });

  it("纯函数：同输入两次调用结果深度相等", () => {
    expect(run()).toEqual(run());
  });

  it("纯函数：不改动传入的 birth 与 chart", () => {
    const b = mk();
    const chart = computeUnifiedChart(b);
    const birthSnapshot = structuredClone(b);
    const chartSnapshot = structuredClone(chart);
    computeFengshui({ birth: b, chart });
    expect(b).toEqual(birthSnapshot);
    expect(chart).toEqual(chartSnapshot);
  });

  it("男女命卦不同 → 方位判语不同", () => {
    const m = run({ gender: "male" });
    const f = run({ gender: "female" });
    expect(m.mingGua.gua).not.toBe(f.mingGua.gua);
  });

  it("引擎版本号存在且为字符串", () => {
    expect(typeof FENGSHUI_ENGINE_VERSION).toBe("string");
    expect(FENGSHUI_ENGINE_VERSION.length).toBeGreaterThan(0);
  });

  it("不含时辰（time=null）时仍可算 —— 命卦只依赖年与性别", () => {
    const f = run({ time: null });
    expect(f.mingGua.gua).toBeGreaterThan(0);
  });
});
