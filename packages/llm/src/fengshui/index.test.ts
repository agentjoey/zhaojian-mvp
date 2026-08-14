import { describe, it, expect, vi, beforeEach } from "vitest";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";

const chatMock = vi.fn();
vi.mock("../client", () => ({ chat: (...a: unknown[]) => chatMock(...a) }));

const { generateFengshuiReading } = await import("./index");

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });
const cfg = { provider: "anthropic", wire: "anthropic", model: "m", baseUrl: "http://x", apiKey: "k" } as never;

beforeEach(() => chatMock.mockReset());

describe("EP-fs-05 generateFengshuiReading", () => {
  it("切出三分节", async () => {
    chatMock.mockResolvedValue("## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n");
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.sections.situation.trim()).toBe("甲");
    expect(r.sections.actions.trim()).toBe("- 丙");
  });

  it("方位说错时自动纠正并记录", async () => {
    const e = fs.personalDirections.E;
    const wrong = e.star === "绝命" ? "五鬼" : "绝命";
    chatMock.mockResolvedValue(`## 形势\n东为${wrong}方。\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n`);
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.corrections.length).toBeGreaterThan(0);
    expect(r.markdown).toContain(`东为${e.star}方`);
  });

  it("伪科学措辞被清除", async () => {
    chatMock.mockResolvedValue("## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 放金属摆件（传统象征）。研究表明有效。\n");
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.markdown).not.toContain("研究表明");
  });

  it("LLM 未配置时抛错（调用方据此走确定性降级）", async () => {
    await expect(generateFengshuiReading(fs, { config: { apiKey: "" } as never })).rejects.toThrow();
  });
});

describe("EP-fs-05 degraded 标记（corrections 非空即代表输出可信度存疑）", () => {
  it("有方位纠正时 degraded 为 true —— 调用方不读 corrections 数组也能识别", async () => {
    const e = fs.personalDirections.E;
    const wrong = e.star === "绝命" ? "五鬼" : "绝命";
    chatMock.mockResolvedValue(`## 形势\n东为${wrong}方。\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n`);
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.corrections.length).toBeGreaterThan(0);
    expect(r.degraded).toBe(true);
  });

  it("无方位纠正时 degraded 为 false", async () => {
    chatMock.mockResolvedValue("## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n");
    const r = await generateFengshuiReading(fs, { config: cfg, language: "zh" });
    expect(r.corrections.length).toBe(0);
    expect(r.degraded).toBe(false);
  });
});
