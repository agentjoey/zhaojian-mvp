import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { sanitizeDream } from "./dream";

const streamSpy = vi.fn(async function* () {
  yield "这个梦在替你处理最近的紧绷。梦里被追，常常对应清醒时躲着的那件事。\n试着今晚把它写下来，写完就睡。";
});
const chatSpy = vi.fn(async () => "一个关于被追赶的梦");
vi.mock("./client", () => ({
  chat: (...a: unknown[]) => chatSpy(...(a as [])),
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

  it("zh：同句有诚实标注 → 保留（行内标注）", () => {
    const t = "民间说法里，梦见水预示着财。这只是文化参照。";
    const out = sanitizeDream(t, "zh");
    expect(out.text).toBe(t);
    expect(out.stripped).toHaveLength(0);
  });

  it("zh：单段输入，句内标注只豁免本句（prompt 要求一段口语走完，豁免必须在同句成立）", () => {
    const t = "直观。这个梦在替你处理焦虑。民间说法里，梦见水预示着财。试着今晚早睡。";
    const out = sanitizeDream(t, "zh");
    expect(out.text).toBe(t); // 预言句句内带标注 → 保留；其余句本就不违规
    expect(out.stripped).toHaveLength(0);
  });

  it("zh：单段输入，无标注预言句被剥，同段其余句保留（段级豁免会漏掉这句）", () => {
    const out = sanitizeDream("这个梦在替你处理焦虑。梦见水预示着财运要来了。试着今晚早睡。", "zh");
    expect(out.text).toContain("处理焦虑");
    expect(out.text).toContain("今晚早睡");
    expect(out.text).not.toContain("预示着财运");
    expect(out.stripped).toHaveLength(1);
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

  it("en：词边界——裸 folk 不再命中 folks；无标注预言句照剥", () => {
    const out = sanitizeDream("Your folks appear in this dream. It foretells a loss.", "en");
    expect(out.text).toContain("Your folks appear");
    expect(out.text).not.toContain("foretells");
    expect(out.stripped).toHaveLength(1);
  });

  it("en：句内 folks 不是标注——同句预言仍剥（裸 folk 变异必红）", () => {
    const out = sanitizeDream("Your folks appear in this dream and it foretells a loss.", "en");
    expect(out.text).not.toContain("foretells");
    expect(out.stripped).toHaveLength(1);
  });

  it("en：folklore 是合规标注，句内预言保留", () => {
    const t = "In folklore, water foretells wealth.";
    const out = sanitizeDream(t, "en");
    expect(out.text).toBe(t);
    expect(out.stripped).toHaveLength(0);
  });

  it("整篇都是无标注预言 → 剥空（由 interpretDream 的 fallback 接管）", () => {
    const out = sanitizeDream("梦见蛇预示着灾祸。这将会发生。", "zh");
    expect(out.text.length).toBeLessThan(6);
  });

  it("zh：标注只豁免同句——跨句/跨段预言句仍剥离", () => {
    const out = sanitizeDream("民间说法仅供参考。\n梦见水预示着财运。", "zh");
    expect(out.text).not.toContain("预示着财运");
    expect(out.text).toContain("民间说法仅供参考");
    expect(out.stripped).toHaveLength(1);
  });

  it("zh：同段内标注句不豁免其他句的无标注预言（段级豁免变异必红）", () => {
    const out = sanitizeDream("民间说法仅供参考。梦见水预示着财运要来了。试着今晚早睡。", "zh");
    expect(out.text).not.toContain("预示着财运");
    expect(out.text).toContain("民间说法仅供参考");
    expect(out.text).toContain("今晚早睡");
    expect(out.stripped).toHaveLength(1);
  });

  it("en：句首大写也命中（ignoreCase 是 load-bearing）", () => {
    const out = sanitizeDream("Foretells doom ahead.", "en");
    expect(out.text).not.toContain("Foretells");
    expect(out.stripped).toHaveLength(1);
  });
});

// ─── interpretDream（mock ./client，模式参照 spirit-chat.test.ts）────────────
// mock 提到文件顶部会影响全文件 import，纯函数测试（上方）不依赖 ./client，不受影响。

const { interpretDream, continueDreamReply, summarizeDreamEntry } = await import("./dream");
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
    // mock 流里明确包含一句无标注预言——管线的 sanitizeDream 闸门必须把它剥掉
    streamSpy.mockImplementationOnce(async function* () {
      yield "这个梦在替你处理最近的紧绷。梦里被追，常常对应清醒时躲着的那件事。梦见水预示着财运要来了。试着今晚把它写下来，写完就睡。";
    });
    let out = "";
    for await (const c of interpretDream(chart, "我梦见被一个人追，跑不动", { language: "zh", config })) out += c;
    const [messages, callOpts] = streamSpy.mock.calls.at(-1)!.slice(1) as unknown as [{ role: string; content: string }[], { maxTokens: number }];
    const user = messages.at(-1)!.content;
    expect(user).toContain("我梦见被一个人追");
    expect(messages[0]!.content).toContain("解梦"); // 硬规则块在系统提示
    // ⚠️ 精确上界：500 字中文按当前模型 tokenizer 粗估需要 ~900-1100 token，
    // 700 会截断深化后的输出（这正是本轮要修的截断风险，原为 700 对应旧的 300 字上限）
    expect(callOpts.maxTokens).toBeLessThanOrEqual(1200);
    expect(callOpts.maxTokens).toBeGreaterThanOrEqual(900); // 也不能收得过紧，否则 12 句上限会被截断
    expect(out).toContain("紧绷"); // mock 输出经后置链后保留正文
    expect(out).toContain("写完就睡");
    expect(out).not.toContain("预示着财运"); // 闸门真的在：无标注预言句被剥（删掉 sanitizeDream 调用本测试必红）
  });

  it("beat② 方法论、文风反例、新长度数字都写进了系统提示（EP-dream-05）", async () => {
    streamSpy.mockClear();
    for await (const _ of interpretDream(chart, "我梦见坠落", { language: "zh", config })) { /* drain */ }
    const [messages] = streamSpy.mock.calls.at(-1)!.slice(1) as unknown as [{ role: string; content: string }[]];
    const sys = messages[0]!.content;
    // beat② 方法论：投射式提问，不是符号查表
    expect(sys).toContain("投射");
    expect(sys).toContain("文化通识");
    // 文风反例（抽象描述，不展示字面句式——字面反例会 priming 模型照写，人工读样实证）
    expect(sys).toContain("对照句式");
    expect(sys).toContain("近义词并排");
    // 新长度数字（旧数字 260/300/170/200/7/8 不应再出现在解梦规则块里）
    expect(sys).toContain("12 句");
    expect(sys).toContain("500 字");
    expect(sys).not.toContain("260 字");
    expect(sys).not.toContain("300 字");
  });

  it("英文路径同样含方法论与反例关键词（EP-dream-05）", async () => {
    streamSpy.mockClear();
    for await (const _ of interpretDream(chart, "I dreamt of falling", { language: "en", config })) { /* drain */ }
    const [messages] = streamSpy.mock.calls.at(-1)!.slice(1) as unknown as [{ role: string; content: string }[]];
    const sys = messages[0]!.content;
    expect(sys).toContain("projection");
    expect(sys).toMatch(/negating/i);
    expect(sys).toContain("12 sentences");
    expect(sys).toContain("320 words");
  });

  it("memory/questionnaire 注入系统提示（spec §6：解梦锚人不锚梦，可变上下文进系统提示）", async () => {
    streamSpy.mockClear();
    for await (const _ of interpretDream(chart, "我梦见坠落", {
      language: "zh",
      config,
      memory: "他最近反复提到换工作的纠结。",
      questionnaire: "自陈：高敏感，容易反刍。",
    })) { /* drain */ }
    const [messages] = streamSpy.mock.calls.at(-1)!.slice(1) as unknown as [{ role: string; content: string }[]];
    // 两段内容都必须出现在系统提示里（buildSpiritSystemPrompt 的 memoryBlock/questionnaireBlock），
    // interpretDream 不透传 memory 时本条必红
    expect(messages[0]!.content).toContain("他最近反复提到换工作的纠结。");
    expect(messages[0]!.content).toContain("自陈：高敏感，容易反刍。");
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

// ─── continueDreamReply（EP-dream-history 追问）────────────────────────────

describe("continueDreamReply", () => {
  const chart = dreamChart;
  const config = dreamConfig;

  it("空追问与超长追问直接抛错（不进 LLM）", async () => {
    streamSpy.mockClear();
    await expect(
      continueDreamReply(chart, "我梦见坠落", [{ role: "spirit", content: "这个梦在处理坠落感。" }], "   ", { language: "zh", config }),
    ).rejects.toThrow();
    await expect(
      continueDreamReply(chart, "我梦见坠落", [{ role: "spirit", content: "这个梦在处理坠落感。" }], "x".repeat(2001), { language: "zh", config }),
    ).rejects.toThrow();
    expect(streamSpy).not.toHaveBeenCalled();
  });

  it("重建首轮 prompt（梦原文+四拍规则）+ 接上 priorTurns + 追加本次追问，spirit/user 正确映射为 assistant/user", async () => {
    streamSpy.mockClear();
    streamSpy.mockImplementationOnce(async function* () {
      yield "坠落常常和失控感有关，这和你说的换工作纠结可能相关。";
    });
    let out = "";
    const priorTurns = [
      { role: "spirit" as const, content: "这个梦在处理坠落感，可能对应最近的失控体验。" },
      { role: "user" as const, content: "失控是指什么？" },
      { role: "spirit" as const, content: "可能是节奏被打乱的那种感觉。" },
    ];
    const result = await continueDreamReply(chart, "我梦见坠落", priorTurns, "会不会跟换工作有关？", { language: "zh", config });
    out = result.text;
    const [messages, callOpts] = streamSpy.mock.calls.at(-1)!.slice(1) as unknown as [{ role: string; content: string }[], { maxTokens: number }];
    expect(messages[0]!.content).toContain("解梦"); // system 仍含解梦硬规则
    expect(messages[1]!.content).toContain("我梦见坠落"); // 首轮 prompt 重建了梦原文
    expect(messages[2]).toEqual({ role: "assistant", content: priorTurns[0]!.content });
    expect(messages[3]).toEqual({ role: "user", content: priorTurns[1]!.content });
    expect(messages[4]).toEqual({ role: "assistant", content: priorTurns[2]!.content });
    expect(messages[5]).toEqual({ role: "user", content: "会不会跟换工作有关？" });
    // EP-dream-05 合并修复：追问和首轮共用同一套 12 句/500 字目标，maxTokens 也必须同步
    // 到 1200——这个函数是 kimi 的 feat/dream-revision 创建时还不存在的新增函数，
    // git 的按行 merge 不会自动把 700→1200 应用到这里，必须显式锁定防止再漏改。
    expect(callOpts.maxTokens).toBeGreaterThanOrEqual(900);
    expect(callOpts.maxTokens).toBeLessThanOrEqual(1200);
    expect(out).toContain("换工作纠结");
  });

  it("追问输出仍经过 sanitizeDream 后置链（无标注预言句被剥）", async () => {
    streamSpy.mockClear();
    streamSpy.mockImplementationOnce(async function* () {
      yield "这和你提到的坠落感有关。梦见水预示着财运要来了。试着记下今晚的感受。";
    });
    const { text } = await continueDreamReply(
      chart,
      "我梦见坠落",
      [{ role: "spirit", content: "这个梦在处理坠落感。" }],
      "还有别的解读吗？",
      { language: "zh", config },
    );
    expect(text).toContain("坠落感有关");
    expect(text).toContain("记下今晚的感受");
    expect(text).not.toContain("预示着财运");
  });

  it("整篇被剥空时给追问专属 fallback（<6 字触发，与初读 fallback 文案不同）", async () => {
    streamSpy.mockClear();
    streamSpy.mockImplementationOnce(async function* () {
      yield "梦见蛇预示着灾祸。这将会发生。";
    });
    const { text } = await continueDreamReply(
      chart,
      "我梦见蛇",
      [{ role: "spirit", content: "这个梦在处理某种警觉。" }],
      "还有别的解读吗？",
      { language: "zh", config },
    );
    expect(text).toContain("能再说说");
  });

  // ─── EP-dream-history-2：dreamText 传 undefined = 续接历史（没有梦原文，
  // priorTurns[0] 就是历史里存的解读全文）───────────────────────────────
  describe("续接历史（dreamText=undefined）", () => {
    it("priorTurns 为空 → 直接抛错（没有可续接的历史解读），不进 LLM", async () => {
      streamSpy.mockClear();
      await expect(
        continueDreamReply(chart, undefined, [], "还有别的解读吗？", { language: "zh", config }),
      ).rejects.toThrow();
      expect(streamSpy).not.toHaveBeenCalled();
    });

    it("不重建首轮「对方讲述了一个梦」的 user 消息——system 之后直接是历史解读（assistant），命盘事实并进 system", async () => {
      streamSpy.mockClear();
      streamSpy.mockImplementationOnce(async function* () {
        yield "这可能和你说的换工作纠结有关。";
      });
      const priorTurns = [{ role: "spirit" as const, content: "这个梦在处理坠落感，可能对应最近的失控体验。" }];
      const { text } = await continueDreamReply(chart, undefined, priorTurns, "会不会跟换工作有关？", { language: "zh", config });
      const [messages] = streamSpy.mock.calls.at(-1)!.slice(1) as unknown as [{ role: string; content: string }[]];
      expect(messages[0]!.content).toContain("解梦"); // system 仍含解梦硬规则
      expect(messages[0]!.content).toContain("命盘事实"); // 命盘事实并进了 system，不是首轮 user 消息
      expect(messages[1]).toEqual({ role: "assistant", content: priorTurns[0]!.content }); // 紧接 system 的就是历史解读，没有首轮 user 消息插在中间
      expect(messages[2]).toEqual({ role: "user", content: "会不会跟换工作有关？" });
      expect(messages.length).toBe(3); // system + 历史解读 + 本次追问，恰好 3 条
      expect(text).toContain("换工作纠结");
    });

    it("续接历史的输出仍经过 sanitizeDream 后置链（护栏不因为跳过首轮 user 消息而失效）", async () => {
      streamSpy.mockClear();
      streamSpy.mockImplementationOnce(async function* () {
        yield "这和坠落感有关。梦见水预示着财运要来了。试着记下今晚的感受。";
      });
      const { text } = await continueDreamReply(
        chart,
        undefined,
        [{ role: "spirit", content: "这个梦在处理坠落感。" }],
        "还有别的解读吗？",
        { language: "zh", config },
      );
      expect(text).toContain("记下今晚的感受");
      expect(text).not.toContain("预示着财运");
    });
  });
});

// ─── summarizeDreamEntry（EP-dream-history 列表摘要）───────────────────────

describe("summarizeDreamEntry", () => {
  const config = dreamConfig;

  it("system 指令明确禁止逐字复述梦境原文（只能转述主题）", async () => {
    chatSpy.mockClear();
    await summarizeDreamEntry("我梦见被一只黑狗追，跑不动", "这个梦在处理坠落感。", { language: "zh", config });
    const [, messages] = chatSpy.mock.calls.at(-1) as unknown as [unknown, { role: string; content: string }[]];
    expect(messages[0]!.content).toContain("不逐字复述");
    // 梦原文只出现在喂给模型的 user 消息里（模型输入侧允许看到，落库的是模型输出）
    expect(messages[1]!.content).toContain("黑狗追");
  });

  it("返回值裁到 DREAM_SUMMARY_MAX_CHARS（160）并去除首尾引号", async () => {
    chatSpy.mockImplementationOnce(async () => `「${"一个关于坠落的梦，".repeat(30)}」`);
    const out = await summarizeDreamEntry("我梦见坠落", "这个梦在处理失控感。", { language: "zh", config });
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.startsWith("「")).toBe(false);
  });

  it("LLM 未配置时抛错（与 summarizeSpiritMemory 同一层错误处理约定，由调用方 action 兜底为 null）", async () => {
    await expect(
      summarizeDreamEntry("我梦见坠落", "这个梦在处理失控感。", { language: "zh", config: { ...config, apiKey: "" } }),
    ).rejects.toThrow();
  });
});
