import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { extractFengshuiFacts, FENGSHUI_FACT_KEYS } from "./facts";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });

describe("EP-fs-05 extractFengshuiFacts", () => {
  it("含命卦、八方判语、喜忌与化解", () => {
    const f = extractFengshuiFacts(fs);
    expect(f.mingGua).toContain("坎");
    expect(f.directions).toHaveLength(8);
    expect(f.favorableElements.length).toBeGreaterThan(0);
    expect(f.remedies.length).toBeGreaterThan(0);
  });

  it("每条方位事实带中文方位名与星名", () => {
    const f = extractFengshuiFacts(fs);
    const se = f.directions.find((d) => d.direction === "SE")!;
    expect(se.label).toBe("东南");
    expect(se.star).toBeTruthy();
    expect(typeof se.auspicious).toBe("boolean");
  });

  // 防泄漏的真闸门：断言「不含出生日期」是空转的 —— FengshuiChart 结构上就装不下
  // 出生日期，任何实现（含有 bug 的）都能通过。字段白名单才会在有人新增字段时失败，
  // 迫使人显式决定该字段能否进 prompt（Layer 1 加居所字段时正是这一刻）。
  it("facts 字段是显式白名单，新增字段会让本测试失败", () => {
    const f = extractFengshuiFacts(fs);
    expect(Object.keys(f).sort()).toEqual([...FENGSHUI_FACT_KEYS].sort());
  });

  it("方位事实只含 prompt 需要的字段，不夹带内部状态", () => {
    const f = extractFengshuiFacts(fs);
    for (const d of f.directions) {
      expect(Object.keys(d).sort()).toEqual(["auspicious", "direction", "label", "rank", "star"]);
    }
  });

  it("化解事实只含 prompt 需要的字段（不含 tenancy 等未用字段）", () => {
    const f = extractFengshuiFacts(fs);
    for (const r of f.remedies) {
      expect(Object.keys(r).sort()).toEqual(
        ["action", "effort", "evidence", "id", "modern", "target", "traditional"],
      );
    }
  });

  it("化解事实保留 evidence 标注，传统象征的 modern 为 null", () => {
    const f = extractFengshuiFacts(fs);
    for (const r of f.remedies) {
      expect(["双重支撑", "传统象征"]).toContain(r.evidence);
      if (r.evidence === "传统象征") expect(r.modern).toBeNull();
    }
    // 确保上面循环没空转：至少真的有一条传统象征
    expect(f.remedies.some((r) => r.evidence === "传统象征")).toBe(true);
  });
});

describe("EP-fs-16 Layer 1 事实", () => {
  const dwelling = { id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "S" as const };
  const l1 = computeFengshui({ birth, chart: computeUnifiedChart(birth), dwelling });

  it("Layer 1 的 facts 带 dwelling，layer 如实为 1", () => {
    const f = extractFengshuiFacts(l1);
    expect(f.layer).toBe(1);
    expect(f.dwelling).toBeTruthy();
    expect(f.dwelling!.guaName).toBe("坎");
    expect(f.dwelling!.sectors).toHaveLength(8);
    expect(["相配", "相冲"]).toContain(f.dwelling!.matchWithPerson);
  });

  it("Layer 0 的 facts 里 dwelling 为 null（不是 undefined，便于序列化稳定）", () => {
    const f = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));
    expect(f.layer).toBe(0);
    expect(f.dwelling).toBeNull();
  });

  it("居所事实不夹带 id 等内部标识（只喂模型需要引用的东西）", () => {
    const f = extractFengshuiFacts(l1);
    expect(JSON.stringify(f)).not.toContain("d1");
  });

  it("白名单已同步——新增字段必须显式过闸", () => {
    const f = extractFengshuiFacts(l1);
    expect(Object.keys(f).sort()).toEqual([...FENGSHUI_FACT_KEYS].sort());
    expect(FENGSHUI_FACT_KEYS).toContain("dwelling");
    expect(FENGSHUI_FACT_KEYS).toContain("cohabitants");
  });
});
