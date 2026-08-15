import { describe, it, expect } from "vitest";
import { ENV_PSYCH_ANCHORS, FENGSHUI_GUARDRAILS } from "../src/fengshui/env-psych";

describe("EP-fs-02 环境心理学对照表", () => {
  it("锚点非空且字段齐全", () => {
    expect(ENV_PSYCH_ANCHORS.length).toBeGreaterThanOrEqual(6);
    for (const a of ENV_PSYCH_ANCHORS) {
      expect(a.traditional).toBeTruthy();
      expect(a.action).toBeTruthy();
      expect(["双重支撑", "传统象征"]).toContain(a.evidence);
    }
  });

  it("双重支撑必有现代机制，传统象征必须 modern 为 null", () => {
    for (const a of ENV_PSYCH_ANCHORS) {
      if (a.evidence === "双重支撑") expect(a.modern).toBeTruthy();
      else expect(a.modern).toBeNull();
    }
  });

  it("含靠山↔prospect-refuge 这一核心桥点", () => {
    const hit = ENV_PSYCH_ANCHORS.find((a) => a.traditional.includes("靠"));
    expect(hit).toBeDefined();
    expect(hit!.modern).toMatch(/prospect|refuge|退路|视野/i);
  });

  it("守护栏含非决定论与禁编科学依据两条", () => {
    const joined = FENGSHUI_GUARDRAILS.join("");
    expect(joined).toMatch(/非决定论|不预言|禁断/);
    expect(joined).toMatch(/传统象征/);
  });
});
