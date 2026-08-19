import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { sanitizeDream } from "./dream";

const streamSpy = vi.fn(async function* () {
  yield "这个梦在替你处理最近的紧绷。梦里被追，常常对应清醒时躲着的那件事。\n试着今晚把它写下来，写完就睡。";
});
vi.mock("./client", () => ({
  chat: vi.fn(),
  chatStream: (...a: unknown[]) => streamSpy(...(a as [])),
}));

describe("sanitizeDream：预言措辞机械扫描", () => {
  it("zh：预言句无标注 → 剥离该句，其余保留", () => {
    const out = sanitizeDream("这个梦在替你处理对失控的恐惧。\n梦见水预示着财运要来了。\n试着今晚早点睡。", "zh");
    expect(out.text).toContain("失控的恐惧");
    expect(out.text).toContain("早点睡");
    expect(out.text).not.toContain("预示着财运");
    expect(out.stripped).toHaveLength(1);
  });

  it("zh：同段有诚实标注 → 保留", () => {
    const t = "民间说法里，梦见水预示着财。这只是文化参照。";
    const out = sanitizeDream(t, "zh");
    expect(out.text).toBe(t);
    expect(out.stripped).toHaveLength(0);
  });

  it("zh：纯心理映照文本 → 原样不动", () => {
    const t = "被追的梦，常常和最近躲着的那件事有关。";
    expect(sanitizeDream(t, "zh").text).toBe(t);
  });

  it("en：prediction without marker → stripped；with marker → kept", () => {
    const bad = sanitizeDream("This dream foretells a promotion. You have been carrying a lot.", "en");
    expect(bad.text).not.toContain("foretells");
    expect(bad.text).toContain("carrying a lot");
    const good = "In folk tradition, water is an omen of wealth — take it as cultural reference only.";
    expect(sanitizeDream(good, "en").text).toBe(good);
  });

  it("整篇都是无标注预言 → 剥空（由 interpretDream 的 fallback 接管）", () => {
    const out = sanitizeDream("梦见蛇预示着灾祸。这将会发生。", "zh");
    expect(out.text.length).toBeLessThan(6);
  });

  it("zh：标注只豁免同段——跨段预言句仍剥离", () => {
    const out = sanitizeDream("民间说法仅供参考。\n梦见水预示着财运。", "zh");
    expect(out.text).not.toContain("预示着财运");
    expect(out.text).toContain("民间说法仅供参考");
    expect(out.stripped).toHaveLength(1);
  });

  it("en：句首大写也命中（toLowerCase 是 load-bearing）", () => {
    const out = sanitizeDream("Foretells doom ahead.", "en");
    expect(out.text).not.toContain("Foretells");
    expect(out.stripped).toHaveLength(1);
  });
});

// ─── interpretDream（mock ./client，模式参照 spirit-chat.test.ts）────────────
// mock 提到文件顶部会影响全文件 import，纯函数测试（上方）不依赖 ./client，不受影响。

const { interpretDream } = await import("./dream");
const { computeUnifiedChart, BirthInputSchema } = await import("@eamvp/core");
const dreamChart = computeUnifiedChart(BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }));
const dreamConfig = { provider: "minimax", wire: "anthropic", baseUrl: "https://x/anthropic", model: "MiniMax-M3", apiKey: "sk-test", supportsJsonSchema: false } as never;

describe("interpretDream", () => {
  const chart = dreamChart;
  const config = dreamConfig;

  it("空梦与超长梦直接抛错（不进 LLM）", async () => {
    await expect(async () => {
      for await (const _ of interpretDream(chart, "   ", { language: "zh", config })) { /* drain */ }
    }).rejects.toThrow();
    await expect(async () => {
      for await (const _ of interpretDream(chart, "x".repeat(2001), { language: "zh", config })) { /* drain */ }
    }).rejects.toThrow();
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it("用户消息含梦原文与四拍提纲；系统提示含解梦硬规则；后置链生效", async () => {
    streamSpy.mockClear();
    let out = "";
    for await (const c of interpretDream(chart, "我梦见被一个人追，跑不动", { language: "zh", config })) out += c;
    const [messages, callOpts] = streamSpy.mock.calls.at(-1)!.slice(1) as unknown as [{ role: string; content: string }[], { maxTokens: number }];
    const user = messages.at(-1)!.content;
    expect(user).toContain("我梦见被一个人追");
    expect(messages[0]!.content).toContain("解梦"); // 硬规则块在系统提示
    expect(callOpts.maxTokens).toBeLessThanOrEqual(700);
    expect(out).toContain("紧绷"); // mock 输出经后置链后保留正文
    expect(out).not.toContain("预示");
  });

  it("整篇 dump/预言时给 fallback（<6 字）", async () => {
    streamSpy.mockImplementationOnce(async function* () {
      yield "```json\n{\"dream\": true}\n```";
    });
    let out = "";
    for await (const c of interpretDream(chart, "我梦见坠落", { language: "zh", config })) out += c;
    expect(out).toContain("再说"); // fallback 文案
  });
});
