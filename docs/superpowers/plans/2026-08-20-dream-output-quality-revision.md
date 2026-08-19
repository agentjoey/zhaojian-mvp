# 解梦输出质量深化（EP-dream-05）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解梦功能已上线，用户反馈真实输出「AI 味重、生硬、不够详实」。给 beat②（心理映照）一套真正可执行的方法论（投射式提问，不是符号查表），治两个具体的文风癖（反衬句、三词罗列），把篇幅上限从 8句/300字/200词 放宽到 12句/500字/320词。

**Architecture:** 纯 prompt 内容 + 长度检查器常量调整，不涉及架构变化。`checkVoice` 的 `dreamMode` 长度档从与 `allowLong` 共用（300字/200词）拆成独立档（500字/320词），`allowLong` 档位保持不变——这是本计划里唯一真正的代码逻辑分支变化，其余是纯文本改动。

**Tech Stack:** 沿用既有 `packages/llm` TypeScript + Vitest。

## Global Constraints

- **这次改动只限解梦（`packages/llm/src/dream.ts` 的 `DREAM_RULES_ZH/EN`），不碰 `/spirit` 常规对话/每日问今的短答纪律**——`allowLong`（常规对话「展开说」）的 300字/200词/6句 三个数字在本计划任何一步都不允许变。每个改 `checkVoice` 的步骤都要跑一遍既有 `allowLong` 相关测试确认零回归。
- **不重新引入固定符号对照表**（方案 C，已被否）。beat② 的方法论是「挑一个具体意象当投射来问」，意象本身不固定意义，意义由这个人的既有资产（记忆/自陈/核心张力）判断方向——不是「蛇=X」这种查表。
- **不强制模型点名"荣格""原型""阴影"等术语**——方法论要落到可执行的指令上，不是让文案里出现学术词汇。
- **`sanitizeDream()`（预言措辞机械扫描）本次不改**——它按句工作，篇幅变长只是句子数量变多，扫描逻辑不受影响。不要因为"顺手"去碰 `packages/llm/src/dream.ts` 里 `sanitizeDream` 函数本体。
- **文风反例（反衬句/三词罗列）无法机械检测**——不要试图给 `checkVoice` 加一条正则规则去抓这两种句式；本仓库已有教训（`fengshui/guard.ts` 的伪科学词表都需要精心设计才不误伤，这两种是更基础的中文句式，误伤率会高到不可用）。这个质量维度只能靠 prompt 里的反例指导 + 人工读样，测试写不出来的部分就不要假装写出来。
- **测试纪律沿用本仓库既有标准**：变异实证、无空转断言、每条断言自问「改坏了会红吗」。

---

## File Structure

**修改文件：**
- `packages/llm/src/eval/voice.ts` — `VOICE_LIMITS` 新增 `zhCharsDream`/`enWordsDream`，`sentencesDream` 8→12；`checkVoice` 长度分支从二档（short/long 共用 dreamMode）改三档（short/long/dream 各自独立）
- `packages/llm/src/eval/voice.test.ts` — 重写 dreamMode 相关的长度/句数测试为新数字；拆开此前"allowLong 与 dreamMode 同档"的合并断言；新增一条锁定 `allowLong` 档位不受影响的回归测试
- `packages/llm/src/dream.ts` — `DREAM_RULES_ZH`/`DREAM_RULES_EN` 重写（beat② 方法论段 + 文风反例段 + 长度数字）；`generateDreamReply` 里 `chatStream` 调用的 `maxTokens` 从 700 提到 1200（500 字中文按现有 tokenizer 换算，700 不够、会截断深化后的输出）
- `packages/llm/src/dream.test.ts` — `maxTokens` 断言更新为新上限；新增断言锁定新 prompt 内容（beat② 方法论关键词、文风反例关键词、新长度数字）确实写进了系统提示，防止将来有人改字符串时漏改
- `docs/superpowers/specs/2026-08-19-dream-interpretation-design.md` — 已在本计划开始前完成（§3.6），本计划不再改动这个文件，只是在此注明依赖关系

---

## Task 1: `checkVoice` 的 dreamMode 长度档独立化

**Files:**
- Modify: `packages/llm/src/eval/voice.ts`
- Modify: `packages/llm/src/eval/voice.test.ts`

**Interfaces:**
- Consumes: 无（独立任务，Task 2 依赖本任务产出）
- Produces: `VOICE_LIMITS.zhCharsDream = 500`、`VOICE_LIMITS.enWordsDream = 320`、`VOICE_LIMITS.sentencesDream = 12`（原为 8，且原本没有独立的 `zhCharsDream`/`enWordsDream`，`dreamMode` 之前借用的是 `zhCharsLong`/`enWordsLong`）。`checkVoice(text, {dreamMode: true, ...})` 按新数字判定，`checkVoice(text, {allowLong: true, ...})`（不带 `dreamMode`）继续按 `zhCharsLong: 300`/`enWordsLong: 200`/`sentencesLong: 6` 判定，两者互不影响。

- [ ] **Step 1: 先跑一遍现有测试，确认起点是绿的**

Run: `pnpm --filter @eamvp/llm test -- src/eval/voice.test.ts`
Expected: 全部 PASS（这是变更前的基线，后面每一步都要能对比）。

- [ ] **Step 2: 改写测试——先写好新数字对应的断言（本步会让部分用例变红，属于预期）**

修改 `packages/llm/src/eval/voice.test.ts`，把文件末尾整个 `describe("长答字数档（EP-dream-01 前置）", ...)` 块替换成：

```ts
describe("长答字数档（EP-dream-01 前置 + EP-dream-05 dreamMode 独立化）", () => {
  const longText = "字".repeat(200); // 200 字：超短答档 120，未超 allowLong 长答档 300

  it("allowLong 同时放宽句数与字数（280 字梦解读不应误判违规）", () => {
    const v = checkVoice("字".repeat(280), { language: "zh", allowLong: true });
    expect(v.filter((x) => x.rule === "length")).toEqual([]);
  });

  it("allowLong 的 301 字仍抓（放宽不是无上限）", () => {
    const v = checkVoice("字".repeat(301), { language: "zh", allowLong: true });
    expect(v.some((x) => x.rule === "length")).toBe(true);
  });

  it("默认档下 200 字被抓、allowLong 下 200 字放行", () => {
    expect(checkVoice(longText, { language: "zh" }).some((x) => x.rule === "length")).toBe(true);
    expect(checkVoice(longText, { language: "zh", allowLong: true }).filter((x) => x.rule === "length")).toEqual([]);
  });

  it(`allowLong 英文长答档：${VOICE_LIMITS.enWordsLong} 词放行、超一词被抓`, () => {
    const atCap = Array(VOICE_LIMITS.enWordsLong).fill("word").join(" ") + ".";
    const overCap = Array(VOICE_LIMITS.enWordsLong + 1).fill("word").join(" ") + ".";
    expect(checkVoice(atCap, { language: "en", allowLong: true }).filter((x) => x.rule === "length")).toEqual([]);
    expect(checkVoice(overCap, { language: "en", allowLong: true }).some((x) => x.rule === "length")).toBe(true);
  });

  it("默认短答档不变（回归）：121 字仍抓", () => {
    expect(checkVoice("字".repeat(121), { language: "zh" }).some((x) => x.rule === "length")).toBe(true);
  });

  describe("dreamMode：独立长度档（EP-dream-05，不再与 allowLong 共用 300/200）", () => {
    it(`dreamMode 下 ${VOICE_LIMITS.zhCharsDream} 字放行、${VOICE_LIMITS.zhCharsDream + 1} 字抓`, () => {
      expect(
        checkVoice("字".repeat(VOICE_LIMITS.zhCharsDream), { language: "zh", dreamMode: true }).filter(
          (x) => x.rule === "length",
        ),
      ).toEqual([]);
      expect(
        checkVoice("字".repeat(VOICE_LIMITS.zhCharsDream + 1), { language: "zh", dreamMode: true }).some(
          (x) => x.rule === "length",
        ),
      ).toBe(true);
    });

    it(`dreamMode 下 ${VOICE_LIMITS.enWordsDream} 词放行、超一词被抓`, () => {
      const atCap = Array(VOICE_LIMITS.enWordsDream).fill("word").join(" ") + ".";
      const overCap = Array(VOICE_LIMITS.enWordsDream + 1).fill("word").join(" ") + ".";
      expect(checkVoice(atCap, { language: "en", dreamMode: true }).filter((x) => x.rule === "length")).toEqual([]);
      expect(checkVoice(overCap, { language: "en", dreamMode: true }).some((x) => x.rule === "length")).toBe(true);
    });

    it(`dreamMode：${VOICE_LIMITS.sentencesDream} 句放行，${VOICE_LIMITS.sentencesDream + 1} 句抓`, () => {
      const n = VOICE_LIMITS.sentencesDream;
      const atCap = Array.from({ length: n }, (_, i) => `第${i + 1}句。`).join("");
      expect(checkVoice(atCap, { language: "zh", dreamMode: true }).filter((x) => x.rule === "sentence-count")).toEqual([]);
      const overCap = atCap + "多一句。";
      expect(checkVoice(overCap, { language: "zh", dreamMode: true }).some((x) => x.rule === "sentence-count")).toBe(true);
    });

    it("dreamMode 300 字（旧上限）不再是边界——现在应该放行，不是刚好卡线", () => {
      // 这条直接锁定「dreamMode 不再借用 zhCharsLong=300」这件事：
      // 改动前这个用例在 301 字时会被抓，改动后 300/301 字都该放行（新上限是 500）。
      expect(checkVoice("字".repeat(301), { language: "zh", dreamMode: true }).filter((x) => x.rule === "length")).toEqual(
        [],
      );
    });
  });

  describe("回归锁定：allowLong 与 dreamMode 现在是两个独立档位，互不影响", () => {
    it("dreamMode 场景下 allowLong 的 300 字上限不生效（应放行到 500）", () => {
      const v = checkVoice("字".repeat(301), { language: "zh", dreamMode: true });
      expect(v.filter((x) => x.rule === "length")).toEqual([]);
    });

    it("allowLong 场景下 dreamMode 的 500 字上限不适用（301 字仍应在 allowLong 下被抓，因为 allowLong 上限还是 300）", () => {
      const v = checkVoice("字".repeat(301), { language: "zh", allowLong: true });
      expect(v.some((x) => x.rule === "length")).toBe(true);
    });
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @eamvp/llm test -- src/eval/voice.test.ts`
Expected: `dreamMode` 相关的新用例 FAIL（现有实现的 `dreamMode` 还在用 300/200/8，不是 500/320/12）；`allowLong` 相关用例应仍 PASS（这组本来就没变过）。

- [ ] **Step 4: 实现——`VOICE_LIMITS` 与 `checkVoice` 长度分支**

修改 `packages/llm/src/eval/voice.ts`：

```diff
 export const VOICE_LIMITS = {
   sentencesShort: 3,
   sentencesLong: 6,
-  sentencesDream: 8,
+  sentencesDream: 12,
   zhChars: 120,
   enWords: 80,
   zhCharsLong: 300,
   enWordsLong: 200,
+  zhCharsDream: 500,
+  enWordsDream: 320,
 } as const;
```

```diff
   const maxSentences = opts.dreamMode
     ? VOICE_LIMITS.sentencesDream
     : opts.allowLong
       ? VOICE_LIMITS.sentencesLong
       : VOICE_LIMITS.sentencesShort;
-  const longChars = !!(opts.allowLong || opts.dreamMode);
```

```diff
   // 2) 长度
   if (zh) {
     const n = zhCharCount(text);
-    const maxChars = longChars ? VOICE_LIMITS.zhCharsLong : VOICE_LIMITS.zhChars;
+    const maxChars = opts.dreamMode
+      ? VOICE_LIMITS.zhCharsDream
+      : opts.allowLong
+        ? VOICE_LIMITS.zhCharsLong
+        : VOICE_LIMITS.zhChars;
     if (n > maxChars) {
       violations.push({ rule: "length", detail: `${n} 字，超过上限 ${maxChars} 字` });
     }
   } else {
     const n = enWordCount(text);
-    const maxWords = longChars ? VOICE_LIMITS.enWordsLong : VOICE_LIMITS.enWords;
+    const maxWords = opts.dreamMode
+      ? VOICE_LIMITS.enWordsDream
+      : opts.allowLong
+        ? VOICE_LIMITS.enWordsLong
+        : VOICE_LIMITS.enWords;
     if (n > maxWords) {
       violations.push({ rule: "length", detail: `${n} words, over the ${maxWords}-word cap` });
     }
   }
```

（`sentence-count` 违规提示里的 `opts.allowLong || opts.dreamMode ? "（已放宽）" : ""` 这行不用改——两种场景确实都是「放宽过」，措辞依然准确。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @eamvp/llm test -- src/eval/voice.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: 变异实证——把 dreamMode 的长度档改回借用 allowLong 的，确认新增的回归测试真的会抓到**

临时把 Step 4 的 `maxChars`/`maxWords` 三元表达式里 `opts.dreamMode ? VOICE_LIMITS.zhCharsDream` 这段改回 `opts.dreamMode ? VOICE_LIMITS.zhCharsLong`（即改回旧行为，只留 `dreamMode`/`allowLong` 共用一档）：

Run: `pnpm --filter @eamvp/llm test -- src/eval/voice.test.ts`
Expected: `describe("dreamMode：独立长度档...")` 与 `describe("回归锁定：allowLong 与 dreamMode 现在是两个独立档位...")` 两组测试变红。

还原这处临时改动，确认恢复绿：

Run: `pnpm --filter @eamvp/llm test -- src/eval/voice.test.ts`
Expected: 全部 PASS，`git diff` 对 `voice.ts` 干净。

- [ ] **Step 7: 提交**

```bash
git add packages/llm/src/eval/voice.ts packages/llm/src/eval/voice.test.ts
git commit -m "[EP-dream-05] checkVoice：dreamMode 长度档独立化（500字/320词/12句，不再借用 allowLong 的 300/200）"
```

---

## Task 2: `DREAM_RULES` 重写 + `maxTokens` 上调

**Files:**
- Modify: `packages/llm/src/dream.ts`
- Modify: `packages/llm/src/dream.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `VOICE_LIMITS.zhCharsDream`/`enWordsDream`/`sentencesDream`（本任务不直接 import 这些常量到 `dream.ts`——`dream.ts` 的 prompt 文本是给模型看的自然语言指令，不是从 `VOICE_LIMITS` 动态拼出来的字符串；两处数字必须手动保持一致，这是本任务的隐含维护责任，不是自动同步）
- Produces: `generateDreamReply`/`interpretDream` 签名不变，system prompt 内容变化，`chatStream` 的 `maxTokens` 从 700 → 1200

- [ ] **Step 1: 写失败测试——锁定新 prompt 内容确实写进了系统提示**

修改 `packages/llm/src/dream.test.ts`，在 `describe("interpretDream", ...)` 块内，`it("用户消息含梦原文与四拍提纲...")` 这条测试之后，新增：

```ts
  it("beat② 方法论、文风反例、新长度数字都写进了系统提示（EP-dream-05）", async () => {
    streamSpy.mockClear();
    for await (const _ of interpretDream(chart, "我梦见坠落", { language: "zh", config })) { /* drain */ }
    const [messages] = streamSpy.mock.calls.at(-1)!.slice(1) as unknown as [{ role: string; content: string }[]];
    const sys = messages[0]!.content;
    // beat② 方法论：投射式提问，不是符号查表
    expect(sys).toContain("投射");
    expect(sys).toContain("文化通识");
    // 文风反例
    expect(sys).toContain("反衬句");
    expect(sys).toContain("三词并列罗列");
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
    expect(sys).toMatch(/contrastive/i);
    expect(sys).toContain("12 sentences");
    expect(sys).toContain("320 words");
  });
```

同时找到既有的 `it("用户消息含梦原文与四拍提纲；系统提示含解梦硬规则；后置链生效", ...)` 这条测试，把它里面的：

```ts
    expect(callOpts.maxTokens).toBeLessThanOrEqual(700);
```

改成：

```ts
    // ⚠️ 精确上界：500 字中文按当前模型 tokenizer 粗估需要 ~900-1100 token，
    // 700 会截断深化后的输出（这正是本轮要修的截断风险，原为 700 对应旧的 300 字上限）
    expect(callOpts.maxTokens).toBeLessThanOrEqual(1200);
    expect(callOpts.maxTokens).toBeGreaterThanOrEqual(900); // 也不能收得过紧，否则 12 句上限会被截断
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @eamvp/llm test -- src/dream.test.ts`
Expected: 新增的两条 FAIL（prompt 里还是旧文案）；`maxTokens` 断言 FAIL（现在是 700，不满足 `≥900`）。

- [ ] **Step 3: 实现——重写 `DREAM_RULES_ZH`/`DREAM_RULES_EN`**

修改 `packages/llm/src/dream.ts`：

```diff
 const DREAM_RULES_ZH = `

 # 解梦规则（对方讲述的是梦境时适用）
-- 按四拍走，一段自然口语走完：不用标题、不分节、不列表——① 你的直观（1–2 句）；② 这个梦在说什么：心理映照，锚到你知道的这个人（记忆/自陈/核心张力），不查符号表；③ 传统说法（有才有，且必须带「民间说法里/传统上认为」这类标注，只作文化参照）；④ 一个邀请（一句，具体可执行）。
-- 禁用预言措辞：预示着/将会/凶兆/吉兆/主灾/主吉（第③拍且有标注时除外）。梦中出现死亡、疾病、血光，一律不作预兆解读，只作心理映照。
-- 噩梦或痛苦内容：先接住情绪，再给解读；不做医疗或心理诊断。
-- 长度：不超过 7 句、260 字（这是留余量的目标，写完超了就删，宁短勿长）。命盘事实至多引一处；默认不以问句结尾。`;
+- 按四拍走，一段自然口语走完：不用标题、不分节、不列表——① 你的直观（1–2 句）；② 这个梦在说什么：挑梦里一个具体的意象或动作（不是整个梦），把它当作一次投射来问——这个意象可能在替这个人的哪部分自己、或者现实处境说话？用你已知的这个人（记忆/自陈/核心张力）来判断该往哪个方向问，而不是替这个意象定死答案。区分「这类意象通常关联什么」（文化通识，不确定）和「这个梦对这个人可能在说什么」（贴着这个人来猜，仍是猜测但更贴身）——两层都提一点，比一次性给结论更真实；③ 传统说法（有才有，且必须带「民间说法里/传统上认为」这类标注，只作文化参照）；④ 一个邀请（一句，具体可执行）。
+- 避免这类句式：「这不是XX，是YY」反衬句、「AA、BB、CC」三词并列罗列——这两种是最容易露怯的写法，写出来先自己检查一遍有没有掉进去。宁可写得笨拙具体，也不要写得工整好看。
+- 禁用预言措辞：预示着/将会/凶兆/吉兆/主灾/主吉（第③拍且有标注时除外）。梦中出现死亡、疾病、血光，一律不作预兆解读，只作心理映照。
+- 噩梦或痛苦内容：先接住情绪，再给解读；不做医疗或心理诊断。
+- 长度：不超过 12 句、500 字（这是留余量的目标，写完超了就删，宁短勿长）。命盘事实至多引一处，且要真正融进②的判断依据里、不是贴标签；默认不以问句结尾。`;

 const DREAM_RULES_EN = `

 # Dream-reading rules (when they share a dream)
-- Four beats in ONE natural spoken paragraph — no headings, no sections, no lists: ① your immediate impression (1–2 sentences); ② what this dream may be processing — psychological reflection anchored in what you know of this person (memory/self-report/core tension), never a symbol dictionary; ③ folk tradition (only if relevant, and ALWAYS marked "folk saying"/"traditionally", as cultural reference only); ④ one invitation (one concrete sentence).
-- No prediction wording: "foretells", "omen", "will come true", "means you will" (except in beat ③ with a marker). Death, illness, blood in a dream: never read as omen — psychological reflection only.
-- Nightmares or painful content: hold the feeling first, then interpret; no medical or psychological diagnosis.
-- Length: at most 7 sentences / 170 words (a target with margin — trim if over; shorter is better). At most ONE chart fact; do not end with a question by default.`;
+- Four beats in ONE natural spoken paragraph — no headings, no sections, no lists: ① your immediate impression (1–2 sentences); ② what this dream may be processing — pick ONE concrete image or action from the dream (not the whole dream) and read it as a projection: which part of this person, or which part of their waking situation, might this image be speaking for? Use what you know of them (memory/self-report/core tension) to judge WHICH direction to ask in — don't pin the image to a fixed meaning. Name both registers briefly: what this kind of image commonly evokes (cultural, uncertain) AND what this dream might be saying for THIS person specifically (grounded, still a guess, but a closer one) — naming both is more honest than a single flat conclusion; ③ folk tradition (only if relevant, and ALWAYS marked "folk saying"/"traditionally", as cultural reference only); ④ one invitation (one concrete sentence).
+- Avoid these patterns: "This isn't X, it's Y" contrastive framing, and "A, B, C" three-item lists of near-synonyms — these are the fastest tells of generic writing; check your own draft for them before finishing. Write something a little clumsy and specific rather than something polished and generic.
+- No prediction wording: "foretells", "omen", "will come true", "means you will" (except in beat ③ with a marker). Death, illness, blood in a dream: never read as omen — psychological reflection only.
+- Nightmares or painful content: hold the feeling first, then interpret; no medical or psychological diagnosis.
+- Length: at most 12 sentences / 320 words (a target with margin — trim if over; shorter is better). At most ONE chart fact — and it must actually drive beat ②'s reasoning, not be a label dropped in for its own sake. Do not end with a question by default.`;
```

- [ ] **Step 4: 实现——`maxTokens` 上调**

修改 `packages/llm/src/dream.ts`：

```diff
-  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 700 });
+  // 500 字中文 ≈ 900-1100 token（EP-dream-05：篇幅上限从 300 字放宽到 500 字后同步调整，
+  // 原 700 是对齐旧上限 300 字算的，不动这里会截断深化后的输出）。
+  const stream = chatStream(cfg, messages, { signal: opts.signal, maxTokens: 1200 });
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @eamvp/llm test -- src/dream.test.ts`
Expected: 全部 PASS。

- [ ] **Step 6: 变异实证——确认新增的 prompt 内容断言真的在守**

临时把 Step 3 里 `DREAM_RULES_ZH` 的「投射」两个字改成别的词（比如「联想」）：

Run: `pnpm --filter @eamvp/llm test -- src/dream.test.ts`
Expected: `it("beat② 方法论、文风反例、新长度数字都写进了系统提示")` 变红。

还原这处临时改动，确认恢复绿。

- [ ] **Step 7: 全量回归**

Run: `pnpm typecheck && pnpm --filter @eamvp/llm test`
Expected: 全绿，0 errors（`dream.ts`/`voice.ts` 的改动不影响其余 `packages/llm` 模块的类型）。

- [ ] **Step 8: 提交**

```bash
git add packages/llm/src/dream.ts packages/llm/src/dream.test.ts
git commit -m "[EP-dream-05] DREAM_RULES 重写：beat②方法论化+文风反例+篇幅放宽；maxTokens 700→1200"
```

---

## Task 3: 人工读样验收（不是代码任务，是这个计划的收尾条件）

**Files:** 无代码改动。

**Interfaces:** 无。

**这一步不能被自动化，也不应该被跳过。** Task 1/2 的测试全绿只能证明：长度/句数在新上限内、prompt 里确实出现了方法论段落和反例段落的关键词。测试**证明不了**模型写出来的东西是不是真的摆脱了「不是A是B」「三词罗列」这两个癖、beat② 是不是真的读出了投射式的深度——这类文风/质量判断只有人能读出来（spec §3.6 已经写明这一条）。

- [ ] **Step 1: 用真实 LLM key 跑探针**

```bash
LLM_API_KEY=sk-... pnpm --filter @eamvp/llm probe:dream
```

- [ ] **Step 2: 逐条读输出，对照这三条检查**

1. 有没有出现「这不是……是……」反衬句、「A、B、C」三词并列罗列——哪怕只出现一次，也说明 Step 3 里的反例段落还需要再加强（不是加新规则，是换更具体的反例措辞）。
2. beat② 是不是真的挑了一个具体意象来问，而不是泛泛地说「这个梦反映了你的焦虑」这种可以套用在任何梦上的空话。
3. 命盘事实是不是在驱动②的判断（读起来像"因为你是这样的人，所以这个意象在这里指向那个方向"），还是又变回了贴标签式的"顺带一提你命盘里有 XX"。

- [ ] **Step 3: 如果读出问题，回到 Task 2 调整 prompt 措辞（不是加新的机械规则），重新跑 Step 1**

- [ ] **Step 4: 确认没问题后，更新 `.agent/CURRENT.md`**

在版本历史表格末尾追加一行：

```markdown
| 🌙 解梦输出深化 | <实际日期> | EP-dream-05：用户反馈上线后输出"AI 味重、不够详实"——beat②从空泛的"心理映照"改成方法论化的投射式提问（挑具体意象、区分文化通识联想与个人贴身联想，不重开符号词典）；prompt 里加反衬句/三词罗列的反例指导（机械规则测不出来，只能人工读样验收）；篇幅 8句/300字/200词→12句/500字/320词，maxTokens 700→1200 防截断；checkVoice 的 dreamMode 长度档与常规对话的 allowLong 拆开独立（互不影响，回归实证）。llm<N> 绿，全部关键改动变异实证 + owner 本人 probe:dream 人工验收通过。 |
```

（`<N>` 按实际测试计数填。）

- [ ] **Step 5: 提交**

```bash
git add .agent/CURRENT.md
git commit -m "[EP-dream-05] CURRENT.md 交付记录（含 owner 人工验收结论）"
```

---

## Self-Review（写完后自查，已完成）

**1. Spec 覆盖检查**：对照 `docs/superpowers/specs/2026-08-19-dream-interpretation-design.md` §3.6——beat② 方法论化 ✅（Task 2）、文风反例段 ✅（Task 2）、篇幅 12句/500字/320词 ✅（Task 1 检查器 + Task 2 prompt 两处同步）、`allowLong` 档位不受影响 ✅（Task 1 显式回归测试）、owner 本人人工验收 ✅（Task 3，未假装能自动化）。

**2. 占位符扫描**：无 TBD；Task 2 Step 3 的 diff 完整给出了 ZH/EN 两版全文，不是「参照上面改」这种引用式描述。

**3. 类型一致性**：Task 1 产出的 `VOICE_LIMITS.zhCharsDream`/`enWordsDream`/`sentencesDream` 与 Task 2 无代码依赖关系（`dream.ts` 的 prompt 文本是手写自然语言，不从 `VOICE_LIMITS` 读值）——这一点在 Task 2 的 Interfaces 小节里已经显式点破，避免实施者误以为两处数字会自动同步。

**4. 范围检查**：三个任务各自独立可测；Task 3 明确标注「不是代码任务」，不会被误认为跳过了实现。
