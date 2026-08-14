import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { extractFengshuiFacts } from "./facts";

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

  it("不泄漏 PII：序列化后不含出生日期/时间", () => {
    const s = JSON.stringify(extractFengshuiFacts(fs));
    expect(s).not.toContain("1990-06-15");
    expect(s).not.toContain("14:30");
  });

  it("化解事实保留 evidence 标注，传统象征的 modern 为 null", () => {
    const f = extractFengshuiFacts(fs);
    for (const r of f.remedies) {
      expect(["双重支撑", "传统象征"]).toContain(r.evidence);
      if (r.evidence === "传统象征") expect(r.modern).toBeNull();
    }
  });
});
