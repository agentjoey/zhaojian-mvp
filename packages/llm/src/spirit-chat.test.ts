import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import type { LlmConfig } from "./provider";

/**
 * 灵多轮对话的物理上限（EP-spirit-voice · A）。
 * 与每日问候同一教训：只写「最多 3 句」的软约束形同虚设，
 * 必须同时钉住 maxTokens——这里钉的是 streamSpiritChat 的 360。
 */

const streamSpy = vi.fn(async function* () {
  yield "好的。";
});
vi.mock("./client", () => ({
  chat: vi.fn(),
  chatStream: (...a: unknown[]) => streamSpy(...(a as [])),
}));

const { streamSpiritChat } = await import("./spirit");

const chart = computeUnifiedChart(
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
);
const config: LlmConfig = {
  provider: "minimax", wire: "anthropic", baseUrl: "https://x/anthropic",
  model: "MiniMax-M3", apiKey: "sk-test", supportsJsonSchema: false,
} as LlmConfig;

beforeEach(() => streamSpy.mockClear());

describe("streamSpiritChat：maxTokens 物理上限", () => {
  it("maxTokens 收紧到 360 以内——120 字中文 ≈ 180 token，余量翻倍但不放回 1200", async () => {
    for await (const _ of streamSpiritChat(chart, [{ role: "user", content: "我最近很焦虑" }], { language: "zh", config })) {
      // 排空流
    }
    const [, , opts] = streamSpy.mock.calls.at(-1) as unknown as [unknown, unknown, { maxTokens: number }];
    // ⚠️ 精确上界：原为 1200，那是线上动辄六七句长文的直接原因
    expect(opts.maxTokens).toBeLessThanOrEqual(360);
    // 也不能收得过狠，否则解锁长答（最多 6 句）会被截断
    expect(opts.maxTokens).toBeGreaterThanOrEqual(300);
  });
});
