import { describe, it, expect } from "vitest";
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import {
  resolveLlmConfig,
  isLlmConfigured,
  extractFacts,
  buildMessages,
  buildSystemPrompt,
  parseSections,
} from "../src/index";

const chart = computeUnifiedChart(
  BirthInputSchema.parse({
    date: "1991-03-15",
    time: "14:30",
    gender: "male",
    latitude: 31.23,
    longitude: 121.47,
    timezone: "Asia/Shanghai",
  }),
);

describe("provider 配置（env 驱动，默认 MiniMax-M3 Coding Plan = Anthropic 兼容）", () => {
  it("默认 = MiniMax-M3，Anthropic 兼容 base /anthropic", () => {
    const cfg = resolveLlmConfig({});
    expect(cfg.provider).toBe("minimax");
    expect(cfg.wire).toBe("anthropic");
    expect(cfg.model).toBe("MiniMax-M3");
    expect(cfg.baseUrl).toBe("https://api.minimax.io/anthropic");
    expect(isLlmConfigured(cfg)).toBe(false); // 无 key
  });
  it("anthropic wire 兼容读取 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL", () => {
    const cfg = resolveLlmConfig({ ANTHROPIC_AUTH_TOKEN: "sk-cp-x" });
    expect(cfg.apiKey).toBe("sk-cp-x");
    expect(isLlmConfigured(cfg)).toBe(true);
  });
  it("可经 env 切换到 DeepSeek（OpenAI 兼容）或任意端点", () => {
    const ds = resolveLlmConfig({ LLM_PROVIDER: "deepseek", LLM_API_KEY: "x" });
    expect(ds.wire).toBe("openai");
    expect(ds.model).toBe("deepseek-chat");
    expect(ds.baseUrl).toBe("https://api.deepseek.com/v1");
    const custom = resolveLlmConfig({ LLM_PROVIDER: "openai-compatible", LLM_BASE_URL: "https://x/v1", LLM_MODEL: "m", LLM_API_KEY: "k" });
    expect(custom.baseUrl).toBe("https://x/v1");
  });
});

describe("facts 抽取（承重事实）", () => {
  const f = extractFacts(chart);
  it("八字关键事实齐全", () => {
    expect(f.bazi.dayMaster).toBe("甲");
    expect(f.bazi.yearPillar).toBe("辛未");
    expect(Object.values(f.bazi.fiveElementCounts).reduce((a, b) => a + b, 0)).toBe(8);
  });
  it("紫微含命宫/福德/化忌宫 + 生年四化", () => {
    expect(f.ziwei.soulPalace.branch).toBe("未");
    expect(f.ziwei.birthMutagens.忌).toBeTruthy();
    expect(f.ziwei.fortunePalace).toBeDefined();
  });
  it("西方含 Sun/Saturn/硬相位", () => {
    expect(f.western?.sun).toContain("Pisces");
    expect(Array.isArray(f.western?.hardAspects)).toBe(true);
  });
});

describe("prompt 组装（反幻觉 + 守护栏）", () => {
  const sys = buildSystemPrompt("en");
  it("系统提示含守护栏与共振锚点与禁编造规则", () => {
    expect(sys).toContain("NEVER invent stars");
    expect(sys).toContain("resonance anchor");
    expect(sys).toMatch(/福德宫|Fortune/);
  });
  it("用户轮把承重事实 JSON 喂入", () => {
    const msgs = buildMessages(chart, { nickname: "Joey" });
    expect(msgs[0]!.role).toBe("system");
    expect(msgs[1]!.content).toContain("辛未"); // 事实在 prompt 中
    expect(msgs[1]!.content).toContain("Joey");
  });
});

describe("分节解析（四段卡片，容错）", () => {
  it("按四个 H2 切分", () => {
    const md = [
      "## Overview", "core theme here",
      "## 命理 — Fate Structure", "命宫 ...",
      "## 心理 — Psychology", "Saturn ...",
      "## Growth", "do this. self-reflection only.",
    ].join("\n");
    const s = parseSections(md, "en");
    expect(s.overview).toContain("core theme");
    expect(s.fate).toContain("命宫");
    expect(s.psyche).toContain("Saturn");
    expect(s.growth).toContain("self-reflection");
  });
});
