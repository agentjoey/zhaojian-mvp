import { describe, it, expect, vi, beforeEach } from "vitest";
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import type { LlmConfig } from "./provider";

/**
 * 灵多轮对话的物理上限（EP-spirit-voice · A）。
 * 与每日问候同一教训：只写「最多 3 句」的软约束形同虚设，
 * 必须同时钉住 maxTokens——这里钉的是 streamSpiritChat 的 600（首版 360 会截残句）。
 */

const streamSpy = vi.fn(async function* () {
  yield "好的。";
});
vi.mock("./client", () => ({
  chat: vi.fn(),
  chatStream: (...a: unknown[]) => streamSpy(...(a as [])),
}));

const { streamSpiritChat, stripSpiritScaffolding } = await import("./spirit");

const chart = computeUnifiedChart(
  BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }),
);
const config: LlmConfig = {
  provider: "minimax", wire: "anthropic", baseUrl: "https://x/anthropic",
  model: "MiniMax-M3", apiKey: "sk-test", supportsJsonSchema: false,
} as LlmConfig;

beforeEach(() => streamSpy.mockClear());

describe("streamSpiritChat：maxTokens 物理上限", () => {
  it("maxTokens 钉在 600——盖住展开档 6 句，不放回 1200；也不回 360（探针实证会截残句）", async () => {
    for await (const _ of streamSpiritChat(chart, [{ role: "user", content: "我最近很焦虑" }], { language: "zh", config })) {
      // 排空流
    }
    const [, , opts] = streamSpy.mock.calls.at(-1) as unknown as [unknown, unknown, { maxTokens: number }];
    // ⚠️ 精确上界：原为 1200，那是线上动辄六七句长文的直接原因；
    // 360 则是另一个坑——CJK ≈1.58 token/字，模型不守规则写 228 字就被拦腰截断（probe:voice 实证）
    expect(opts.maxTokens).toBeLessThanOrEqual(600);
    expect(opts.maxTokens).toBeGreaterThanOrEqual(500);
  });
});

describe("streamSpiritChat：消息拼装", () => {
  function lastMessages(): { role: string; content: string }[] {
    const [, messages] = streamSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[], unknown];
    return messages;
  }

  it("种子消息注入今日事实——「今日运势」必须答得了（此前无数据+守护栏压制只能绕）", async () => {
    for await (const _ of streamSpiritChat(chart, [{ role: "user", content: "今日运势如何" }], { language: "zh", config })) {
      // 排空流
    }
    const seed = lastMessages()[1]!;
    expect(seed.role).toBe("user");
    // 今日事实块在场（dayGanZhi 是 computeDailyFortune 的既算字段）且带「据此直接回答」规则
    expect(seed.content).toContain('"dayGanZhi"');
    expect(seed.content).toContain("今日");
    expect(seed.content).toContain("直接回答");
  });

  it("近因提示：末条用户消息追加 3 句上限；命中展开触发词换 6 句版", async () => {
    for await (const _ of streamSpiritChat(chart, [{ role: "user", content: "我最近很焦虑" }], { language: "zh", config })) {
      // 排空流
    }
    expect(lastMessages().at(-1)!.content).toContain("3 句以内");

    for await (const _ of streamSpiritChat(chart, [{ role: "user", content: "我为什么总是拖延" }], { language: "zh", config })) {
      // 排空流
    }
    const last = lastMessages().at(-1)!;
    expect(last.content).toContain("不超过 6 句");
    expect(last.content).not.toContain("3 句以内");
  });
});

describe("stripSpiritScaffolding：脚手架泄漏护栏", () => {
  it("剥掉整段 ```json dump（probe 实证的 RESONANCE_ANCHORS 事故）", () => {
    const dump = '```json\n{\n  "RESONANCE_ANCHORS": [\n    {"topic": "内在世界轴"}\n  ]\n}\n```';
    expect(stripSpiritScaffolding(dump)).toBe("");
  });

  it("剥掉 ## 标题 / 列表项 / 【元注记】，保留正常口吻行", () => {
    const messy = "## RESONANCE_ANCHORS（东西方共振锚点）\n- 西：命主星 Pluto\n【新会话，无历史锚点】\n先吃饭，先睡觉。事情明天还在，人也得在。";
    expect(stripSpiritScaffolding(messy)).toBe("先吃饭，先睡觉。事情明天还在，人也得在。");
  });

  it("正常回应原样保留（护栏不得误伤口吻）", () => {
    const good = "我直说：你不是不行，是太久没敢要。\n这一点上你骗不了我，也别骗自己。";
    expect(stripSpiritScaffolding(good)).toBe(good);
  });

  it("围栏跨行跟踪：开围栏后到闭围栏前全剥，闭围栏后恢复", () => {
    const mixed = "我在。\n```\nsecret json\n```\n继续说。";
    expect(stripSpiritScaffolding(mixed)).toBe("我在。\n继续说。");
  });
});
