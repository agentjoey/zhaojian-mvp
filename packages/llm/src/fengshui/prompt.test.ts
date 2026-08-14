import { describe, it, expect } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { extractFengshuiFacts } from "./facts";
import { buildFengshuiSystemPrompt, buildFengshuiUserPrompt, parseFengshuiSections, FENGSHUI_SECTION_KEYS } from "./prompt";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const facts = extractFengshuiFacts(computeFengshui({ birth, chart: computeUnifiedChart(birth) }));

describe("EP-fs-05 风水 prompt", () => {
  it("三个分节键", () => {
    expect(FENGSHUI_SECTION_KEYS).toEqual(["situation", "youAndSpace", "actions"]);
  });

  it("system prompt 含守护栏关键约束", () => {
    const s = buildFengshuiSystemPrompt("zh");
    expect(s).toContain("传统象征");
    expect(s).toMatch(/研究表明|科学证明/);
    expect(s).toMatch(/免责|不构成/);
  });

  it("system prompt 明令只用给定方位事实", () => {
    expect(buildFengshuiSystemPrompt("zh")).toMatch(/不得自行推算|禁止自行/);
  });

  it("user prompt 带入命卦与八方判语", () => {
    const u = buildFengshuiUserPrompt(facts);
    expect(u).toContain("坎");
    expect(u).toContain("东南"); // 坎命生气方
    expect(u).toContain("生气");
  });

  it("user prompt 对传统象征条目显式标注", () => {
    const u = buildFengshuiUserPrompt(facts);
    expect(u).toContain("传统象征");
  });

  it("parseFengshuiSections 按 H2 切三节，缺节置空", () => {
    const md = "## 形势\n甲\n\n## 境与你\n乙\n";
    const s = parseFengshuiSections(md, "zh");
    expect(s.situation.trim()).toBe("甲");
    expect(s.youAndSpace.trim()).toBe("乙");
    expect(s.actions).toBe("");
  });
});
