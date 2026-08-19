# 解梦（EP-dream）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给「本命之灵」加解梦专门技能 + 独立入口 `/dream`（web + TG 双臂），心理映照为主、传统象征带诚实标注、梦原文不落库。

**Architecture:** 无计算层模块——锚人不锚梦：解读锚在 persona/关系记忆/问卷/命盘事实上。LLM 层新增 `interpretDream`（buffered，非流式，因后置扫描需要完整文本）+ `sanitizeDream` 双语机械扫描（与 `sanitizeFengshui` 同层同强度）。Spec：`docs/superpowers/specs/2026-08-19-dream-interpretation-design.md`（双轮评审已过，§3.5/§4 的明写排除项是评审硬要求）。

**Tech Stack:** pnpm monorepo（packages/core 纯函数 / packages/llm 口吻渲染 / apps/web Next.js 15 App Router）；vitest；Tailwind v4 + CSS 令牌。

## Global Constraints

- 全程 `NEXT_PUBLIC_DREAM_ENABLED=1` 门控，**默认关**；flag 关闭时三处入口不出现、`/dream` 与两个 API 不可达（API 侧也查 flag）
- **梦原文不落库**：严禁 `appendMessage`、严禁写 `spirit_messages`、不提供 GET 历史；不进日志（只记 chars）
- 颜色一律 `var(--color-*)` 令牌；圆角 `var(--radius-*)`；不新增硬编码色值
- i18n 中英双份（英文优先产品）；中文方位/宫名匹配注意子串陷阱（精确匹配）
- 断言纪律：每条断言自问「对应逻辑改坏它会红吗」；关键分支做变异验证（改坏→红→还原）
- 反幻觉链保持：extractFacts-only / sanitizeReading / correctMutagens / stripSpiritScaffolding / sanitizeDream 全部串联
- commit 前缀 `[EP-dream-0x]`；**不合并 main**；完工交 claude 验收
- 基线：core 159 / llm 222 / web 279 全绿（main @ fc9d917）

---

### Task 1: checkVoice 长答字数档（EP-dream-01 前置）

**Files:**
- Modify: `packages/llm/src/eval/voice.ts`
- Test: `packages/llm/src/eval/voice.test.ts`

**Interfaces:**
- Produces: `VOICE_LIMITS` 新增 `sentencesDream: 8, zhCharsLong: 300, enWordsLong: 200`；`VoiceOptions` 新增 `dreamMode?: boolean`。`allowLong` 从此同时放宽句数（→6）与字数（→300/200）；`dreamMode` 为 8 句 + 长字数档。Task 6 的探针依赖 `dreamMode`。

- [ ] **Step 1: 写失败测试**（追加到 `voice.test.ts` 末尾）

```ts
describe("长答字数档（EP-dream-01 前置）", () => {
  const longText = "字".repeat(200); // 200 字：超短答档 120，未超长答档 300

  it("allowLong 同时放宽句数与字数（280 字梦解读不应误判违规）", () => {
    const v = checkVoice("字".repeat(280), { language: "zh", allowLong: true });
    expect(v.filter((x) => x.rule === "length")).toEqual([]);
  });

  it("dreamMode：8 句 300 字内放行，9 句抓", () => {
    const eight = Array.from({ length: 8 }, (_, i) => `第${i + 1}句。`).join("");
    expect(checkVoice(eight, { language: "zh", dreamMode: true }).filter((x) => x.rule === "sentence-count")).toEqual([]);
    const nine = eight + "第九句。";
    expect(checkVoice(nine, { language: "zh", dreamMode: true }).some((x) => x.rule === "sentence-count")).toBe(true);
  });

  it("dreamMode 下 280 字放行、301 字抓", () => {
    expect(checkVoice("字".repeat(280), { language: "zh", dreamMode: true }).filter((x) => x.rule === "length")).toEqual([]);
    expect(checkVoice("字".repeat(301), { language: "zh", dreamMode: true }).some((x) => x.rule === "length")).toBe(true);
  });

  it("默认短答档不变（回归）：121 字仍抓", () => {
    expect(checkVoice("字".repeat(121), { language: "zh" }).some((x) => x.rule === "length")).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd packages/llm && npx vitest run src/eval/voice.test.ts`
Expected: FAIL（`dreamMode` 不存在 / 280 字在 allowLong 下仍被判 length 违规）

- [ ] **Step 3: 实现**

`voice.ts` 两处修改：

```ts
export const VOICE_LIMITS = {
  sentencesShort: 3,
  sentencesLong: 6,
  sentencesDream: 8,
  zhChars: 120,
  enWords: 80,
  zhCharsLong: 300,
  enWordsLong: 200,
} as const;
```

```ts
export type VoiceOptions = {
  language: ReadingLanguage;
  /** 对方明确要求展开（「详细说」「为什么」/"tell me more" 等）：6 句 + 长字数档 */
  allowLong?: boolean;
  /** 解梦场景（显式展开）：8 句 + 长字数档（EP-dream） */
  dreamMode?: boolean;
  /** 本轮之前灵已说过的回应（用于锚点事实复引检测） */
  previousSpiritReplies?: string[];
  /** 灵的锚点事实标签（deriveSpirit persona.anchorFacts） */
  anchorFacts?: string[];
};
```

`checkVoice` 内的阈值计算改为：

```ts
  const maxSentences = opts.dreamMode
    ? VOICE_LIMITS.sentencesDream
    : opts.allowLong
      ? VOICE_LIMITS.sentencesLong
      : VOICE_LIMITS.sentencesShort;
  const longChars = !!(opts.allowLong || opts.dreamMode);
```

随后把句数违规 detail 里的 `${maxSentences}` 保持现状；字数检查处把 `VOICE_LIMITS.zhChars` / `VOICE_LIMITS.enWords` 的引用分别替换为 `longChars ? VOICE_LIMITS.zhCharsLong : VOICE_LIMITS.zhChars` 与 `longChars ? VOICE_LIMITS.enWordsLong : VOICE_LIMITS.enWords`（两处检查各一处引用，逐一读上下文再改）。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd packages/llm && npx vitest run src/eval/voice.test.ts`
Expected: 全绿（含既有用例零回归）

- [ ] **Step 5: Commit**

```bash
git add packages/llm/src/eval/voice.ts packages/llm/src/eval/voice.test.ts
git commit -m "[EP-dream-01] checkVoice 长答字数档：zhCharsLong 300/enWordsLong 200 + dreamMode 8 句档"
```

---

### Task 2: `sanitizeDream()` 双语机械后置扫描

**Files:**
- Create: `packages/llm/src/dream.ts`
- Test: `packages/llm/src/dream.test.ts`

**Interfaces:**
- Produces: `sanitizeDream(text: string, language: ReadingLanguage): { text: string; stripped: string[] }`。规则：段落含预言措辞词表命中 **且** 同段无诚实标注标记 → 逐句剥离命中句；有标注 → 保留。Task 3 的 `interpretDream` 消费它。⚠️ 双语词表从第一天做起（fengshui 英文侧那笔债不抄——spec §3.5）。

- [ ] **Step 1: 写失败测试**（新建 `dream.test.ts`）

```ts
import { describe, it, expect } from "vitest";
import { sanitizeDream } from "./dream";

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
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd packages/llm && npx vitest run src/dream.test.ts`
Expected: FAIL（`./dream` 模块不存在）

- [ ] **Step 3: 实现 `dream.ts`**（本任务先只放扫描器；Task 3 在同文件加 `interpretDream`）

```ts
import type { ReadingLanguage } from "./prompt";

/**
 * 解梦后置机械扫描（EP-dream-01）——与 sanitizeFengshui 同层：确定性兜底，不依赖模型自觉。
 * 规则：段落命中预言措辞词表 且 同段无诚实标注标记 → 逐句剥离命中句；有标注 → 保留。
 * 中英双词表从第一天做起（fengshui 英文侧机械校验失效是已记账的债，不抄）。
 */

/** 预言措辞：断言未来/吉凶定性。词表扩充时注意——长词在前（「预示着」⊃「预示」靠 some 命中，顺序无害，但剥离以句为单位）。 */
const PREDICTION_ZH = ["预示着", "预示", "将会", "凶兆", "吉兆", "主灾", "主吉", "血光", "大难临头", "必有"];
const PREDICTION_EN = ["foretell", "an omen", "omen of", "will come true", "means you will", "a sign that you will", "predicts"];

/** 诚实标注标记（段级存在性判定）。 */
const MARKER_ZH = ["民间说法", "传统上", "传统说法", "古人认为", "周公解梦", "民俗"];
const MARKER_EN = ["folk", "traditionally", "traditional interpretation", "cultural reference"];

const SENTENCE_RE = /[^。！？!?….\n]+[。！？!?….]*/g;

export function sanitizeDream(text: string, language: ReadingLanguage): { text: string; stripped: string[] } {
  const zh = language === "zh";
  const predictions = zh ? PREDICTION_ZH : PREDICTION_EN;
  const markers = zh ? MARKER_ZH : MARKER_EN;
  const stripped: string[] = [];

  const paras = text.split("\n").map((para) => {
    if (markers.some((m) => para.toLowerCase().includes(m.toLowerCase()))) return para;
    const sentences = para.match(SENTENCE_RE) ?? [para];
    const kept = sentences.filter((s) => {
      const hit = predictions.some((p) => s.toLowerCase().includes(p.toLowerCase()));
      if (hit) stripped.push(s.trim());
      return !hit;
    });
    return kept.join("");
  });

  return { text: paras.join("\n").replace(/\n{3,}/g, "\n\n").trim(), stripped };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd packages/llm && npx vitest run src/dream.test.ts`
Expected: 5 条全绿

- [ ] **Step 5: 变异验证**——把 `MARKER_ZH` 清空跑测试：「有标注 → 保留」用例必须变红；还原（`git checkout` 前确认本任务已 commit，先 commit 再变异）。

- [ ] **Step 6: Commit**

```bash
git add packages/llm/src/dream.ts packages/llm/src/dream.test.ts
git commit -m "[EP-dream-01] sanitizeDream：预言措辞双语机械后置扫描（无标注→剥句）"
```

---

### Task 3: `interpretDream`（llm 口吻层）

**Files:**
- Modify: `packages/llm/src/dream.ts`（追加）
- Modify: `packages/llm/src/index.ts`（导出新函数）
- Test: `packages/llm/src/dream.test.ts`（追加；mock `./client` 模式参照 `spirit-chat.test.ts`）

**Interfaces:**
- Consumes: `buildSpiritSystemPrompt`/`stripSpiritScaffolding`/`SpiritOptions`（`./spirit`）、`sanitizeDream`（本文件 Task 2）、`extractFacts`/`sanitizeReading`/`correctMutagens`、`chatStream`（`./client`）
- Produces: `interpretDream(chart: UnifiedChart, dreamText: string, opts?: SpiritOptions): AsyncGenerator<string>`——**buffered 一次性 yield**（后置扫描需要完整文本；≤300 字等待可控）。路由层（Task 4）只消费这一个函数。

- [ ] **Step 1: 写失败测试**（`dream.test.ts` 顶部加 mock，参照 `spirit-chat.test.ts` 的 `vi.mock("./client")` 模式；注意：一个文件里既有纯函数测试又有 mock 测试时，mock 会影响全文件 import——把 `interpretDream` 测试集中放文件尾部 describe，mock 提到文件顶部，纯函数测试不受影响）

```ts
// 文件顶部（既有 import 之后）：
import { vi } from "vitest";
const streamSpy = vi.fn(async function* () {
  yield "这个梦在替你处理最近的紧绷。梦里被追，常常对应清醒时躲着的那件事。\n试着今晚把它写下来，写完就睡。";
});
vi.mock("./client", () => ({
  chat: vi.fn(),
  chatStream: (...a: unknown[]) => streamSpy(...(a as [])),
}));

// 文件尾部追加：
describe("interpretDream", () => {
  const { interpretDream } = await import("./dream");
  const { computeUnifiedChart, BirthInputSchema } = await import("@eamvp/core");
  const chart = computeUnifiedChart(BirthInputSchema.parse({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 }));
  const config = { provider: "minimax", wire: "anthropic", baseUrl: "https://x/anthropic", model: "MiniMax-M3", apiKey: "sk-test", supportsJsonSchema: false } as never;

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
    const [messages, callOpts] = streamSpy.mock.calls.at(-1)!.slice(1) as [{ role: string; content: string }[], { maxTokens: number }];
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd packages/llm && npx vitest run src/dream.test.ts`
Expected: FAIL（`interpretDream` 未导出）

- [ ] **Step 3: 实现**——`dream.ts` 顶部 import 区与追加内容：

```ts
// 顶部追加 import（保留 Task 2 的 ReadingLanguage import）：
import type { UnifiedChart } from "@eamvp/core";
import { deriveSpirit } from "@eamvp/core";
import { extractFacts } from "./facts";
import { sanitizeReading } from "./prompt";
import { correctMutagens } from "./correct";
import { chatStream, type ChatMessage } from "./client";
import { resolveLlmConfig, isLlmConfigured } from "./provider";
import { buildSpiritSystemPrompt, stripSpiritScaffolding, type SpiritOptions } from "./spirit";
```

```ts
// ─── 解梦（EP-dream-01）────────────────────────────────────────────
// 无计算层模块：锚人不锚梦（spec §2）。buffered 一次性产出——后置扫描（sanitizeDream）
// 需要完整文本，流式逐行吐会让「被剥的预言句」先被用户看到；≤300 字等待可控。

export const DREAM_MAX_CHARS = 2000;

const DREAM_RULES_ZH = `

# 解梦规则（对方讲述的是梦境时适用）
- 按四拍走，一段自然口语走完：不用标题、不分节、不列表——① 你的直观（1–2 句）；② 这个梦在说什么：心理映照，锚到你知道的这个人（记忆/自陈/核心张力），不查符号表；③ 传统说法（有才有，且必须带「民间说法里/传统上认为」这类标注，只作文化参照）；④ 一个邀请（一句，具体可执行）。
- 禁用预言措辞：预示着/将会/凶兆/吉兆/主灾/主吉（第③拍且有标注时除外）。梦中出现死亡、疾病、血光，一律不作预兆解读，只作心理映照。
- 噩梦或痛苦内容：先接住情绪，再给解读；不做医疗或心理诊断。
- 长度：不超过 8 句、300 字。命盘事实至多引一处；默认不以问句结尾。`;

const DREAM_RULES_EN = `

# Dream-reading rules (when they share a dream)
- Four beats in ONE natural spoken paragraph — no headings, no sections, no lists: ① your immediate impression (1–2 sentences); ② what this dream may be processing — psychological reflection anchored in what you know of this person (memory/self-report/core tension), never a symbol dictionary; ③ folk tradition (only if relevant, and ALWAYS marked "folk saying"/"traditionally", as cultural reference only); ④ one invitation (one concrete sentence).
- No prediction wording: "foretells", "omen", "will come true", "means you will" (except in beat ③ with a marker). Death, illness, blood in a dream: never read as omen — psychological reflection only.
- Nightmares or painful content: hold the feeling first, then interpret; no medical or psychological diagnosis.
- Length: at most 8 sentences / 200 words. At most ONE chart fact; do not end with a question by default.`;

/**
 * 解梦（EP-dream-01）：灵的专门技能。buffered 单次 yield。
 * 后置链顺序：脚手架护栏 → sanitizeReading → sanitizeDream → correctMutagens。
 */
export async function* interpretDream(
  chart: UnifiedChart,
  dreamText: string,
  opts: SpiritOptions = {},
): AsyncGenerator<string> {
  const cfg = opts.config ?? resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：请设置 LLM_API_KEY。");
  const language = opts.language ?? "en";
  const zh = language === "zh";
  const dream = dreamText.trim();
  if (!dream) throw new Error("梦境内容为空");
  if (dream.length > DREAM_MAX_CHARS) throw new Error(`梦境内容过长（>${DREAM_MAX_CHARS} 字）`);

  const persona = deriveSpirit(chart);
  const facts = extractFacts(chart);
  const system = buildSpiritSystemPrompt(persona, chart, language, opts) + (zh ? DREAM_RULES_ZH : DREAM_RULES_EN);
  const factsBlock = `\`\`\`json\n${JSON.stringify(facts, null, 2)}\n\`\`\``;
  const user = zh
    ? `以下是确定性算出的命盘事实（你只能引用这些）：\n\n${factsBlock}\n\n对方讲述了一个梦：\n\n「${dream}」\n\n请以「本命之灵」的身份、用简体中文、按解梦规则回应这个梦。`
    : `Here are the deterministically computed chart facts (the ONLY facts you may use):\n\n${factsBlock}\n\nThey shared a dream:\n\n"${dream}"\n\nRespond as their 本命之灵, following the dream-reading rules.`;

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 700 });
  let all = "";
  for await (const chunk of stream) all += chunk;

  let out = stripSpiritScaffolding(all);
  out = sanitizeReading(out, language, chart.western !== null);
  out = sanitizeDream(out, language).text;
  out = correctMutagens(out, chart.ziwei.birthMutagens).text;
  if (out.length < 6) {
    out = zh ? "我在。这个梦先放在这里——再说一遍给我听，好吗？" : "I'm here. Let's set this dream down for a moment — tell it to me again?";
  }
  console.info(`[dream] model=${cfg.model} chars=${out.length}`);
  yield out;
}
```

`packages/llm/src/index.ts` 追加：

```ts
export { interpretDream, sanitizeDream, DREAM_MAX_CHARS } from "./dream";
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd packages/llm && npx vitest run src/dream.test.ts && pnpm --filter @eamvp/llm test`
Expected: dream.test.ts 全绿；llm 全量 222+ 绿

- [ ] **Step 5: 变异验证**——① 把 `sanitizeDream(out, language).text` 改为 `out`（跳过扫描）→「后置链生效」的 `not.toContain("预示")` 相关断言应变红（先把 mock 输出改成含「预示」一句确认抓得到）；② `maxTokens: 700` 改回 `1200` → 上界断言变红。各自还原。

- [ ] **Step 6: Commit**

```bash
git add packages/llm/src/dream.ts packages/llm/src/dream.test.ts packages/llm/src/index.ts
git commit -m "[EP-dream-01] interpretDream：解梦口吻渲染（四拍提纲/双语硬规则/后置链/buffered）"
```

---

### Task 4: 双端 API 路由（EP-dream-02）

**Files:**
- Create: `apps/web/app/api/spirit/dream/route.ts`
- Create: `apps/web/app/api/tg/dream/route.ts`
- Test: `apps/web/app/api/spirit/dream/__tests__/route.test.ts`
- Test: `apps/web/app/api/tg/dream/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `interpretDream`/`DREAM_MAX_CHARS`（`@eamvp/llm`，Task 3）；鉴权照 `app/api/spirit/chat/route.ts` 与 `app/api/tg/spirit/route.ts` 范式
- Produces: `POST /api/spirit/dream` body `{chart, dream, memory?, questionnaire?}`；`POST /api/tg/dream` body `{dream}`（chart 服务端取）。两者返回 `text/plain` 完整解读（buffered，非 SSE）。⚠️ **TG 路由严禁 `appendMessage`/写 `spirit_messages`/GET 历史**（spec §4 明写排除项）

- [ ] **Step 1: 写失败测试**——TG 路由测试（web 路由测试同构，参照 `app/api/tg/fengshui/__tests__/route.test.ts` 的 mock 模式）：

```ts
// app/api/tg/dream/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const appendMessage = vi.fn();
vi.mock("@/lib/tg/data", () => ({
  appendMessage,
  getMemory: vi.fn(async () => null),
  getQuestionnaire: vi.fn(async () => null),
  saveMemory: vi.fn(),
  listMessages: vi.fn(async () => []),
}));
vi.mock("@/lib/tg/session", () => ({
  TG_COOKIE: "zj_tg",
  readSession: vi.fn(async (v?: string) => (v === "ok" ? { uid: "u1", tgId: 123 } : null)),
}));
vi.mock("@/lib/tg/identity", () => ({
  getProfileForUser: vi.fn(async () => ({ id: "p1", chart: { fake: true } })),
}));
vi.mock("@/lib/tg/quota", () => ({ consumeQuota: vi.fn(async () => true) }));
vi.mock("@/lib/entitlements", () => ({ consumeLlm: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/i18n/server", () => ({ localeFromRequest: () => "zh" }));
const interpretDreamSpy = vi.fn(async function* () { yield "解读"; });
vi.mock("@eamvp/llm", () => ({
  interpretDream: (...a: unknown[]) => interpretDreamSpy(...(a as [])),
  DREAM_MAX_CHARS: 2000,
}));

// cookies() mock：next/headers
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "ok" }) }),
}));

const { POST } = await import("../route");

function req(body: unknown) {
  return new Request("http://x/api/tg/dream", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/tg/dream", () => {
  beforeEach(() => vi.clearAllMocks());

  it("正常解读：200 + 文本；且绝不落库（appendMessage 零调用）", async () => {
    const res = await POST(req({ dream: "我梦见坠落" }));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("解读");
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("缺 dream → 400；超长 → 400", async () => {
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req({ dream: "x".repeat(2001) }))).status).toBe(400);
    expect(interpretDreamSpy).not.toHaveBeenCalled();
  });
});
```

⚠️ 上面 mock 的模块路径/形状以 `app/api/tg/fengshui/__tests__/route.test.ts` 实际写法为准对齐（session/quota/entitlements 的 mock 签名照抄该文件）。web 路由测试：缺 chart → 400、缺 dream → 400、LLM 未配置 → 503、Bearer 用户超额度 → 402（照 `app/api/spirit/chat` 现有测试模式）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd apps/web && npx vitest run app/api/tg/dream app/api/spirit/dream`
Expected: FAIL（路由不存在）

- [ ] **Step 3: 实现**

`app/api/spirit/dream/route.ts`（照 chat 路由范式，buffered 返回）：

```ts
import { resolveLlmConfig, isLlmConfigured, interpretDream, DREAM_MAX_CHARS } from "@eamvp/llm";
import type { UnifiedChart } from "@eamvp/core";
import { supabaseAdmin } from "@/lib/tg/admin";
import { consumeLlm } from "@/lib/entitlements";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/spirit/dream —— 无状态解梦：chart 与梦随 body 传来，解读不落库。 */
export async function POST(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_DREAM_ENABLED !== "1") return new Response("未开启", { status: 404 });
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) return new Response("LLM 未配置", { status: 503 });

  const body = await req.json().catch(() => ({}));
  const chart = body?.chart as UnifiedChart | undefined;
  const dream = typeof body?.dream === "string" ? body.dream.trim() : "";
  if (!chart) return new Response("缺少命盘 chart", { status: 400 });
  if (!dream) return new Response("缺少梦境 dream", { status: 400 });
  if (dream.length > DREAM_MAX_CHARS) return new Response("梦境过长", { status: 400 });

  const authHeader = req.headers.get("authorization");
  let userId: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabaseAdmin().auth.getUser(authHeader.slice(7));
    userId = data.user?.id;
  }
  if (userId) {
    const gate = await consumeLlm(userId);
    if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });
  }

  const language = localeFromRequest(req);
  try {
    let out = "";
    for await (const chunk of interpretDream(chart, dream, {
      language,
      memory: typeof body?.memory === "string" ? body.memory : undefined,
      questionnaire: typeof body?.questionnaire === "string" ? body.questionnaire : undefined,
    })) out += chunk;
    return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(`⚠️ ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
```

`app/api/tg/dream/route.ts`（照 tg/spirit 鉴权范式；**无 appendMessage、无 listMessages、无 GET**）：

```ts
import { cookies } from "next/headers";
import { formatQuestionnaire } from "@eamvp/core";
import { interpretDream, DREAM_MAX_CHARS } from "@eamvp/llm";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser } from "@/lib/tg/identity";
import { getMemory, getQuestionnaire } from "@/lib/tg/data";
import { consumeQuota } from "@/lib/tg/quota";
import { consumeLlm } from "@/lib/entitlements";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tg/dream —— TG 会话解梦。
 * ⚠️ 只参照 api/tg/spirit 的鉴权，不参照其持久化：
 * 严禁 appendMessage / 严禁写 spirit_messages / 不提供 GET 历史（spec §4 明写排除项——
 * 梦原文不落库）。记忆提炼走 summarizeSpiritMemory 滚动摘要（无 PII），本路由 v1 不做。
 */
export async function POST(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_DREAM_ENABLED !== "1") return new Response("未开启", { status: 404 });
  const c = (await cookies()).get(TG_COOKIE)?.value;
  const s = await readSession(c);
  if (!s) return new Response("未登录", { status: 401 });
  const profile = await getProfileForUser(s.uid);
  if (!profile) return new Response("无档案", { status: 400 });

  const body = await req.json().catch(() => ({}));
  const dream = typeof body?.dream === "string" ? body.dream.trim() : "";
  if (!dream) return new Response("缺少梦境 dream", { status: 400 });
  if (dream.length > DREAM_MAX_CHARS) return new Response("梦境过长", { status: 400 });

  if (!(await consumeQuota(s.tgId))) return Response.json({ error: "quota" }, { status: 402 });
  const gate = await consumeLlm(s.uid);
  if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });

  const mem = await getMemory(profile.id);
  const qa = await getQuestionnaire(profile.id);
  const language = localeFromRequest(req);

  try {
    let out = "";
    for await (const chunk of interpretDream(profile.chart, dream, {
      language,
      memory: mem ?? undefined,
      questionnaire: qa ? formatQuestionnaire(qa) : undefined,
    })) out += chunk;
    return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(`⚠️ ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test`
Expected: 全绿（279 + 新增）

- [ ] **Step 5: 变异验证**——给 TG 路由临时加一行 `await appendMessage(profile.id, "user", dream)` → 「appendMessage 零调用」断言必须变红；还原。

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/spirit/dream apps/web/app/api/tg/dream
git commit -m "[EP-dream-02] 解梦双端路由：/api/spirit/dream + /api/tg/dream（flag 门控/双闸/不落库）"
```

---

### Task 5: `/dream` 页面 + 三处入口 + flag 门控（EP-dream-03）

**Files:**
- Create: `apps/web/app/dream/page.tsx`
- Modify: `apps/web/app/page.tsx`（web 目录 + TG_ENTRIES 各加一条）
- Modify: `apps/web/components/AppShell.tsx`（NAV 加一条）
- Modify: `apps/web/lib/i18n/messages/zh.ts`、`en.ts`（`dream.*` + `nav.dream` + `home.entries.dream` + `home.tg.entries.dream`）
- Test: `apps/web/app/__tests__/page.test.tsx`（追加 dream 入口两条，照「居家风水」用例模式）

**Interfaces:**
- Consumes: `POST /api/spirit/dream` / `POST /api/tg/dream`（Task 4）；`hasTgSession`/`tgGetProfile`/`isTelegram`（`@/lib/tg/client`）；`getActiveProfile`（`@/lib/profiles`）；`useTgMainButton`/`haptics`（`@/lib/tg/ui`）；`PageHeader`、`Button`（`@/components/ui` / `@/components/PageHeader`）
- Produces: 路由 `/dream`；i18n 键 `dream.kicker/title/subtitle/placeholder/submit/interpreting/errorTooLong/noProfile`、`nav.dream`、`home.entries.dream.{title,sub}`、`home.tg.entries.dream.{title,subtitle}`

- [ ] **Step 1: i18n 键**（zh.ts / en.ts 对称添加）

```ts
// zh.ts
// nav 命名空间：dream: "解梦",
// home.entries：dream: { title: "解梦", sub: "梦的映照 · 心理解读" },
// home.tg.entries：dream: { title: "解梦", subtitle: "梦的映照 · 心理解读" },
dream: {
  kicker: "解 梦",
  title: "说说你的梦",
  subtitle: "梦是潜意识的信。灵替你读它——观照，不预言。",
  placeholder: "比如：我梦见自己在一片很清的水面上走……",
  submit: "解这个梦",
  interpreting: "解梦中…",
  errorTooLong: "梦太长了，先讲最清晰的那段（2000 字以内）。",
  noProfile: "尚无命盘档案——先起盘，灵才认得你。",
},
// en.ts 对应（nav.dream: "Dream"；dream.kicker: "Dream Reading"；title: "Tell me your dream"；subtitle: "Dreams are letters from the unconscious — reflection, not prediction."；placeholder: "e.g. I dreamed I was walking on clear water…"；submit: "Interpret"；interpreting: "Interpreting…"；errorTooLong: "Too long — tell the clearest part (under 2000 chars)."；noProfile: "No chart profile yet — cast your chart first."；home.entries.dream: { title: "Dreams", sub: "Dream mirror · psychological reflection" }；home.tg.entries.dream: { title: "Dreams", subtitle: "Dream mirror · psychological reflection" }）
```

- [ ] **Step 2: 写失败测试**——`app/__tests__/page.test.tsx` 追加（完全照「居家风水」两条用例的模式，`renderHome()` 复用）：

```ts
describe("TG 首页入口列表：解梦「梦」", () => {
  it("TG 内 + flag 开：「解梦」入口出现，点击导向 /dream", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    await renderHome();
    const cell = await screen.findByText("解梦");
    fireEvent.click(cell);
    expect(routerPush).toHaveBeenCalledWith("/dream");
  });

  it("TG 内 + flag 关：「解梦」入口不出现", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    await renderHome();
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("解梦")).toBeNull();
  });
});
```

注：beforeEach 里补 `vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1")` 或逐用例 stub，照该文件既有 flag 用例的写法。

- [ ] **Step 3: 跑测试确认失败**

Run: `cd apps/web && npx vitest run app/__tests__/page.test.tsx`
Expected: FAIL（「解梦」不存在）

- [ ] **Step 4: 实现三处入口**

`app/page.tsx`（web 臂 ENTRIES 与 TG 臂 TG_ENTRIES 各加一条；两处都要，门控一致——文件里原有醒目注释就是这条教训）：

```ts
const ENTRIES = [
  { href: "/calendar", key: "calendar" as const },
  { href: "/chart", key: "annual" as const },
  { href: "/chart", key: "chart" as const },
  { href: "/reading", key: "reading" as const },
  ...(process.env.NEXT_PUBLIC_DREAM_ENABLED === "1" ? [{ href: "/dream", key: "dream" as const }] : []),
] as const;
```

```ts
const TG_ENTRIES = [
  // …原有项保持顺序…
  ...(process.env.NEXT_PUBLIC_DREAM_ENABLED === "1"
    ? [{ icon: "梦", accent: "var(--color-water)", key: "dream" as const, path: "/dream" }]
    : []),
  // 档 案项保持在最后（若现有顺序如此）
];
```

`AppShell.tsx` NAV：

```ts
  ...(process.env.NEXT_PUBLIC_DREAM_ENABLED === "1"
    ? [{ href: "/dream", char: "梦", key: "nav.dream" }]
    : []),
```

- [ ] **Step 5: 实现 `app/dream/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { useIsTelegram, useTgMainButton, haptics } from "@/lib/tg/ui";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";

export default function DreamPage() {
  const t = useT();
  const inTg = useIsTelegram();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [dream, setDream] = useState("");
  const [reading, setReading] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setProfile(hasTgSession() ? await tgGetProfile() : await getActiveProfile());
      } catch {
        setProfile(null);
      }
    })();
  }, []);

  const tooLong = dream.trim().length > 2000;
  const canSubmit = !!profile && dream.trim().length >= 4 && !tooLong && !pending;

  async function submit() {
    if (!profile || !canSubmit) return;
    setPending(true);
    setError(null);
    setReading(null);
    haptics.light();
    try {
      const res = hasTgSession()
        ? await fetch("/api/tg/dream", { method: "POST", body: JSON.stringify({ dream }) })
        : await fetch("/api/spirit/dream", { method: "POST", body: JSON.stringify({ chart: profile.chart, dream }) });
      if (!res.ok) throw new Error(await res.text());
      setReading(await res.text());
      haptics.success();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  useTgMainButton({ text: pending ? t("dream.interpreting") : t("dream.submit"), onClick: submit, enabled: canSubmit, visible: inTg });

  if (profile === undefined) return null;
  if (profile === null)
    return (
      <main className="mx-auto max-w-[720px] px-4 py-10">
        <PageHeader kicker={t("dream.kicker")} title={t("dream.title")} />
        <p className="mt-6 text-[14px] text-ink-2">{t("dream.noProfile")}</p>
        <Link href="/reading" className="mt-4 inline-block text-[13px] underline underline-offset-4" style={{ color: "var(--color-cinnabar)" }}>
          {t("reading.kicker")} →
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-[720px] px-4 pb-8 pt-6">
      <PageHeader kicker={t("dream.kicker")} title={t("dream.title")} annotation={t("dream.subtitle")} />
      <div className="mt-6">
        <textarea
          value={dream}
          onChange={(e) => setDream(e.target.value)}
          placeholder={t("dream.placeholder")}
          rows={5}
          className="w-full resize-none bg-transparent p-4 text-[15px] leading-[1.9] outline-none focus:border-[var(--color-line-strong)]"
          style={{ border: "1px solid var(--color-line)", borderRadius: "var(--radius-card)", color: "var(--color-ink)" }}
        />
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
          <span>{tooLong ? t("dream.errorTooLong") : ""}</span>
          <span className="font-latin">{dream.trim().length}/2000</span>
        </div>
        {!inTg && (
          <div className="mt-4">
            <Button onClick={submit} disabled={!canSubmit}>
              {pending ? t("dream.interpreting") : t("dream.submit")}
            </Button>
          </div>
        )}
        {error && (
          <div className="mt-4 px-4 py-3 text-[13px]" style={{ borderRadius: "var(--radius-card)", background: "var(--color-error-bg)", color: "var(--color-seal)", border: "1px solid var(--color-error-line)" }}>
            {error}
          </div>
        )}
        {reading && (
          <div className="zj-rise mt-8 pt-6" style={{ borderTop: "1px solid var(--color-line)" }}>
            <div className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>{t("dream.kicker")}</div>
            <p className="reading-prose mt-3 whitespace-pre-wrap">{reading}</p>
          </div>
        )}
      </div>
    </main>
  );
}
```

⚠️ 实现时先读 `apps/web/lib/tg/ui.ts` 核对 `useTgMainButton`/`haptics` 的真实签名（参数名/字段以源码为准），并读一个既有页面（如 `app/fengshui/object/page.tsx`）对齐 TG 数据分流写法。

- [ ] **Step 6: 跑测试 + 全量验证**

Run: `pnpm --filter @eamvp/web test && pnpm typecheck && pnpm --filter @eamvp/web lint`
Expected: 全绿 / exit 0 / 0 errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/dream apps/web/app/page.tsx apps/web/components/AppShell.tsx apps/web/lib/i18n apps/web/app/__tests__/page.test.tsx
git commit -m "[EP-dream-03] /dream 页面（web+TG 双臂）+ 三处入口 + DREAM_ENABLED 门控"
```

---

### Task 6: 探针梦例集 + 实跑验收（EP-dream-04）

**Files:**
- Create: `packages/llm/src/eval/dream-run.ts`
- Create: `packages/llm/scripts/probe-dream.ts`
- Modify: `packages/llm/package.json`（加 `probe:dream` script）
- Modify: `.agent/CURRENT.md`（版本行）

**Interfaces:**
- Consumes: `interpretDream`（Task 3）、`checkVoice` 的 `dreamMode`（Task 1）、`EVAL_CASES`/`pickOneCasePerElement` 模式（`eval/voice-run.ts`）
- Produces: `runDreamProbe()` + `pnpm --filter @eamvp/llm probe:dream`

- [ ] **Step 1: 实现 `dream-run.ts`**（模式照 `voice-run.ts`）

```ts
/**
 * 解梦风格探针（EP-dream-04）——需 LLM_API_KEY。
 * 2 个原型 × 8 个经典梦例，每条解读过 checkVoice（dreamMode）+ 预言措辞检查。
 *   LLM_API_KEY=sk-... pnpm --filter @eamvp/llm probe:dream
 */
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import { interpretDream, sanitizeDream } from "../dream";
import { resolveLlmConfig, isLlmConfigured } from "../provider";
import { EVAL_CASES } from "./cases";
import { checkVoice, type VoiceViolation } from "./voice";

const DREAM_CASES = [
  "我梦见自己从很高的地方坠落，一直落不到底",
  "我梦见被什么东西追，我跑不动，喊不出声",
  "我梦见牙齿一颗颗掉下来",
  "我梦见自己在一片很清的水面上走",
  "我梦见去世的奶奶，她一句话也不说，就看着我",
  "我梦见考试，卷子上的字一个都不认识",
  "我梦见在陌生的城市里迷路，手机没有信号",
  "我梦见自己在飞，飞得很低，贴着屋顶",
];

export type DreamProbeResult = {
  caseId: string;
  dream: string;
  reply: string;
  violations: VoiceViolation[];
  predictionStripped: number;
  error?: string;
};

export async function runDreamProbe(opts?: {
  onReply?: (r: DreamProbeResult, index: number, total: number) => void;
}): Promise<DreamProbeResult[]> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) throw new Error("LLM 未配置：设置 LLM_API_KEY 后再跑 probe:dream。");
  // 两个原型足够覆盖口吻差异（金=shanghai-m-1991、水=guangzhou-m-1995，与 voice 探针同源）
  const cases = [EVAL_CASES[0]!, EVAL_CASES[2]!];
  const total = cases.length * DREAM_CASES.length;
  const results: DreamProbeResult[] = [];
  let i = 0;
  for (const c of cases) {
    const chart = computeUnifiedChart(BirthInputSchema.parse(c.input));
    for (const dream of DREAM_CASES) {
      let result: DreamProbeResult;
      try {
        let reply = "";
        for await (const chunk of interpretDream(chart, dream, { language: "zh" })) reply += chunk;
        const violations = checkVoice(reply, { language: "zh", dreamMode: true });
        const predictionStripped = sanitizeDream(reply, "zh").stripped.length; // 后置链已跑过，此处恒 0；非 0 说明链路漏了
        result = { caseId: c.id, dream, reply, violations, predictionStripped };
      } catch (e) {
        result = { caseId: c.id, dream, reply: "", violations: [{ rule: "error", detail: String(e) }], predictionStripped: 0, error: String(e) };
      }
      results.push(result);
      opts?.onReply?.(result, i, total);
      i++;
    }
  }
  return results;
}
```

`scripts/probe-dream.ts` 照 `scripts/probe-voice.ts` 的增量打印模式（每例打印 `✓/✗ + 违规摘要`，结尾打印通过率与 `predictionStripped` 总和，恒应为 0）。`package.json` 加 `"probe:dream": "tsx scripts/probe-dream.ts"`。

- [ ] **Step 2: 单测**——`dream-run.ts` 的纯逻辑（梦例集非空/覆盖 8 例）可省；重点是 Task 2/3 已覆盖扫描与生成。此任务测试从简：不新增单测，靠实跑。

- [ ] **Step 3: 实跑**

```bash
set -a; . apps/web/.env.local; set +a
cd packages/llm && npx tsx scripts/probe-dream.ts
```

Expected: 16 例全跑完；记录通过率、预言措辞命中数、`predictionStripped` 总和（恒 0）；**人工读 16 条全文**（重点：掉牙/已故亲人两例不作预兆解读、已故亲人先接住情绪）。

- [ ] **Step 4: 不达标则调 prompt/词表再跑**（每轮改动记录进汇报）；达标后：

- [ ] **Step 5: CURRENT.md 版本行 + Commit**

```bash
printf '| 🌙 解梦 | 2026-08-19 | EP-dream(feat 分支待填)：灵解梦专门技能+独立入口 /dream（web+TG 双臂）——锚人不锚梦/四拍口语/sanitizeDream 双语机械扫描/梦原文不落库/DREAM_ENABLED 默认关。llm/core/web 全绿，probe:dream 16 例实跑验收 |\n' >> .agent/CURRENT.md
git add -A packages/llm .agent/CURRENT.md
git commit -m "[EP-dream-04] probe:dream 梦例探针（2 原型×8 梦例，dreamMode 检查）+ CURRENT.md"
```

---

## Self-Review 记录（plan 作者已自查）

- **Spec 覆盖**：§3.5 sanitizeDream→Task 2；checkVoice 长答档→Task 1；interpretDream→Task 3；双路由+不落库→Task 4；页面+三处入口+flag→Task 5；探针→Task 6；§5 隐私红线→Task 4 明写排除+变异验证、Task 6 人工读样；英文双份→Task 2 词表、Task 3 规则块、Task 5 i18n。无缺口。
- **类型一致性**：`interpretDream(chart, dream, opts)` 签名在 Task 3/4/6 一致；`sanitizeDream(text, language)` 在 Task 2/3/6 一致；`dreamMode` 在 Task 1/6 一致；`DREAM_MAX_CHARS` 在 Task 3/4 一致。
- **已知留白（有意）**：TG 路由 v1 不写记忆摘要（spec §4 标注 v1 不做）；probe:dream 只跑 zh（线上抱怨集中中文路径，与 voice 探针同取舍）。
