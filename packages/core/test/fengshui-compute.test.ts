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

describe("EP-fs-12 computeFengshui Layer 1", () => {
  const dwelling = {
    id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "S" as const,
  };
  const runL1 = () => {
    const b = mk();
    return computeFengshui({ birth: b, chart: computeUnifiedChart(b), dwelling });
  };

  it("给了居所 → layer 1，且 dwelling 字段齐备", () => {
    const f = runL1();
    expect(f.layer).toBe(1);
    if (f.layer !== 1) throw new Error("unreachable");
    expect(f.dwelling.guaName).toBe("坎");        // 向南 → 坐北 → 坎宅
    expect(f.dwelling.name).toBe("家");
    expect(Object.keys(f.dwelling.sectors)).toHaveLength(8);
    expect(["相配", "相冲"]).toContain(f.dwelling.matchWithPerson);
  });

  it("不给居所 → 仍是 layer 0，dwelling 为 undefined（波1 行为不变）", () => {
    const f = run();
    expect(f.layer).toBe(0);
    expect(f.dwelling).toBeUndefined();
  });

  it("命卦八方与宅卦八方是两套，互不覆盖", () => {
    const f = runL1();
    if (f.layer !== 1) throw new Error("unreachable");
    // 1990 男 = 坎命；本例宅卦也是坎 → 两套恰好相同。换个朝向即应不同。
    const other = computeFengshui({ birth: mk(), chart: computeUnifiedChart(mk()), dwelling: { ...dwelling, facing: "SE" } });
    if (other.layer !== 1) throw new Error("unreachable");
    expect(other.dwelling.guaName).toBe("乾");
    expect(other.personalDirections.SE.star).toBe(f.personalDirections.SE.star); // 命卦不受居所影响
    expect(other.dwelling.sectors.SE.star).not.toBe(f.dwelling.sectors.SE.star); // 宅卦随朝向变
  });

  it("Layer 1 的化解里确实含宅层条目，且仍全部合法", () => {
    const f = runL1();
    const l0 = run();
    expect(f.remedies.length).toBeGreaterThan(l0.remedies.length);

    // 只断言「数量变多」不够——任意两三条合法 Remedy 都能让它通过，
    // 宅层化解被整个换掉也测不出来。必须认到具体条目。
    const dwellingIds = f.remedies.filter((r) => r.id.startsWith("fs-dw-")).map((r) => r.id);
    expect(dwellingIds).toContain("fs-dw-best");
    expect(dwellingIds).toContain("fs-dw-worst");
    // 且宅层条目的 target 要指向具体方位（宅八方判语），不是泛泛而谈
    const best = f.remedies.find((r) => r.id === "fs-dw-best")!;
    expect(best.target).toMatch(/[东南西北]/);
    expect(best.traditional).toContain("宅");

    // 个人层条目必须原样保留，不能被宅层挤掉
    for (const r of l0.remedies) expect(f.remedies.some((x) => x.id === r.id)).toBe(true);

    for (const r of f.remedies) {
      if (r.evidence === "传统象征") expect(r.modern).toBeNull();
    }
  });

  it("引擎版本已递增到 fs-2（化解生成规则变了，旧报告必须失效）", () => {
    expect(FENGSHUI_ENGINE_VERSION).toBe("fs-2");
  });

  it("纯函数：Layer 1 同输入两次调用深度相等", () => {
    expect(runL1()).toEqual(runL1());
  });
});
