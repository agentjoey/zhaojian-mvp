import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeUnifiedChart, BirthInputSchema, computeDailyFortune } from "@eamvp/core";
import type { LlmConfig } from "./provider";

/**
 * 每日问候（`/today` 与每日推送共用）的**长度与结构**约束。
 *
 * 线上问题：一条今日问候写到六七句、大段意象铺陈。原因不是没写约束——prompt 里
 * 一直写着「2–3 句」——而是 `maxTokens: 400` 给了模型充裕的空间超出，软约束形同虚设。
 * 所以本文件同时钉住**两件事**：指令里的硬指标，以及 `maxTokens` 这个物理上限。
 * 只测其中一个都抓不到真实的失败模式（只改指令不收 maxTokens，线上就是原样）。
 */

const chatSpy = vi.fn(async () => "今天水气平和。手里那件搁着的事，挑最小的一步做掉。");
vi.mock("./client", () => ({
  chat: (...a: unknown[]) => chatSpy(...(a as [])),
  chatStream: vi.fn(),
}));

const { generateDailySpiritGreeting } = await import("./spirit");

const chart = computeUnifiedChart(
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
);
const daily = computeDailyFortune(chart, "2026-08-16");
const config: LlmConfig = {
  provider: "minimax", wire: "anthropic", baseUrl: "https://x/anthropic",
  model: "MiniMax-M3", apiKey: "sk-test", supportsJsonSchema: false,
} as LlmConfig;

async function callDaily(language: "zh" | "en") {
  await generateDailySpiritGreeting(chart, daily, "2026-08-16", { language, config });
  const [, messages, opts] = chatSpy.mock.calls.at(-1) as unknown as [
    unknown, { role: string; content: string }[], { maxTokens: number },
  ];
  return { user: messages.find((m) => m.role === "user")!.content, maxTokens: opts.maxTokens };
}

beforeEach(() => chatSpy.mockClear());

describe("每日问候：长度与结构约束", () => {
  it("中文指令给出可核对的硬上限（句数 + 字数），而不是只说「简短」", async () => {
    const { user } = await callDaily("zh");
    expect(user).toContain("最多 3 句");
    expect(user).toContain("110 字");
  });

  it("中文指令要求同时给出「今天的倾向」与「一件可做/该注意的事」", async () => {
    const { user } = await callDaily("zh");
    // 用户诉求是「几句话说清今天的运势分析和注意事项」——两件事都得点名要，
    // 只说「简短」不会让模型自己补出第二件。
    expect(user).toMatch(/倾向/);
    expect(user).toMatch(/值得注意|可以去做/);
    expect(user).toMatch(/具体、可执行|可执行/);
  });

  it("英文指令同样带硬上限与两件事（英文是多数访客的默认路径）", async () => {
    const { user } = await callDaily("en");
    expect(user).toMatch(/at most 3 sentences/i);
    expect(user).toMatch(/under 80 words/i);
    expect(user).toMatch(/tendency/i);
    expect(user).toMatch(/one concrete thing/i);
  });

  it("maxTokens 收到 220 以内——软约束必须有物理上限兜底", async () => {
    const { maxTokens } = await callDaily("zh");
    // ⚠️ 精确上界而非 `toBeLessThan(500)`：后者对改回 400 同样通过，
    // 而 400 正是线上写成六七句的直接原因。
    expect(maxTokens).toBeLessThanOrEqual(220);
    // 也不能收得过狠，否则第 3 句会被截断
    expect(maxTokens).toBeGreaterThanOrEqual(180);
  });

  it("不得退回「预测吉凶/事件」——原有守护栏没被这次收紧顺手删掉", async () => {
    const { user } = await callDaily("zh");
    expect(user).toMatch(/绝不作吉凶或事件的预测/);
    const en = await callDaily("en");
    expect(en.user).toMatch(/NEVER as a prediction/i);
  });
});
