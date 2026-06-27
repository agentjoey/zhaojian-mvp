# 本命之灵 · 陪伴层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Workers (kimi/opencode) read `AGENTS.md`; entry verbs via `pactify help`.

**Goal:** 给「照见」加一个从用户自己命盘派生的单一陪伴人格「本命之灵」——能认领命盘、随时对话、每日问今、随互动变熟，并最终结合心理问卷给出演化的自我画像。

**Architecture:** 方案 B「附加层」——不重写已验证的三段式解读。`deriveSpirit(chart)` 在 core 派生确定性人格种子；llm 渲染口吻并复用反幻觉四道（`extractFacts`/`SYNTHESIS_GUARDRAILS`/`sanitizeReading`/`correctMutagens`）；web 新增对话面板 + 每日问今 + 画像；Supabase 新增 `spirit_messages` 表 + `profiles.spirit_memory` 列。灵入口由 `NEXT_PUBLIC_SPIRIT_ENABLED` flag 默认关闭门控。

**Tech Stack:** TypeScript / pnpm monorepo（`@eamvp/core` 纯函数 + Vitest · `@eamvp/llm` provider 无关双线 · `apps/web` Next 16/React 19/Tailwind 4）· Supabase（匿名 + RLS）· SSE 流式。

## Global Constraints（每个 task 隐式包含）

- **排盘不许 LLM 算**：星曜/宫位/四化/四柱一律核心计算，灵只解释；对话只准引用 `extractFacts(chart)` 内出现的事实。
- **反幻觉四道**：所有灵的产出（开场白/对话/问今/画像文案）经 system prompt 硬规则（只引用给定事实、不预测吉凶、非决定论、反思性、成长导向）+ `sanitizeReading` + `correctMutagens`。
- **西方盘缺失降级**：复用 `streamReading` 既有「缓冲+净化后一次产出」降级路径，禁止泄露西方杜撰。
- **不进冻结命盘**：所有新派生（`deriveSpirit`）在 facts 层算，新旧命盘通吃、零迁移。
- **无 PII 观测**：日志仅元信息（model/stream/chars/sections），禁出生信息/昵称/对话原文（同 EP-514）。
- **轻资产红线**：无 3D / 无 TTS / 无金币；灵形象 = 主导五行派生水墨印记 + 名号 + 文本口吻；素白水墨美学（UI v2 令牌）。
- **flag 门控**：所有灵 UI 入口包 `process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1"`，默认关闭；后端/迁移不门控（纯增量、无副作用）。
- **测试纪律**：core 改动 `pnpm --filter @eamvp/core test` 全绿；llm 改动 `pnpm --filter @eamvp/llm test` 全绿；web 改动 `pnpm --filter @eamvp/web build` 通过（含 TS 校验）。
- **Web 本地端口固定 3030**（3000 被占）。LLM key 已在 `apps/web/.env.local`。
- **语言**：UI 文案 en 优先（首发海外），与现有 `ReadingLanguage` 一致。

---

## File Structure（决策锁定）

**core（`@eamvp/core`）**
- Create `packages/core/src/spirit/index.ts` — `deriveSpirit(chart) → SpiritPersona`、`SpiritPersona` 类型、archetype 映射表。
- Create `packages/core/src/spirit/index.test.ts` — 派生单测。
- Create `packages/core/src/spirit/portrait.ts` — `deriveSelfPortrait(chart, memory?) → SelfPortrait`（Phase 3）。
- Modify `packages/core/src/index.ts` — 导出 spirit 公共 API。

**llm（`@eamvp/llm`）**
- Create `packages/llm/src/spirit.ts` — `buildSpiritSystemPrompt`、`generateSpiritIntro`、`streamSpiritChat`、`summarizeSpiritMemory`、`generateDailySpiritGreeting`。
- Create `packages/llm/src/spirit.test.ts` — prompt 组装 + 接地/降级单测。
- Modify `packages/llm/src/index.ts` — 导出。
- Modify `packages/llm/src/eval/cases.ts` — 增灵对话 eval 用例（不臆造星曜/不预测吉凶）。

**db（Supabase migrations）**
- Create `supabase/migrations/0002_spirit_messages.sql` — 新表 + RLS（Phase 1）。
- Create `supabase/migrations/0003_spirit_memory.sql` — `profiles.spirit_memory jsonb`（Phase 2）。
- Create `supabase/migrations/0004_profile_questionnaire.sql` — `profiles.questionnaire jsonb`（Phase 3）。

**web（`apps/web`）**
- Create `apps/web/app/api/spirit/chat/route.ts` — SSE 对话路由。
- Create `apps/web/lib/spirit.ts` — 客户端：`listMessages`/`appendMessage`/记忆读写（Supabase）。
- Create `apps/web/app/chart/SpiritPanel.tsx` — 命盘页开场白卡 + 对话面板 + 水墨印记。
- Create `apps/web/app/chart/SpiritSigil.tsx` — 主导五行水墨印记/符号组件。
- Create `apps/web/app/calendar/AskToday.tsx` — 每日问今卡 + CTA（Phase 2）。
- Create `apps/web/app/profiles/Questionnaire.tsx` — 最小心理问卷（Phase 3）。
- Create `apps/web/app/chart/SelfPortrait.tsx` — 自我画像可视化（Phase 3）。
- Modify `apps/web/app/chart/page.tsx` — 接入 SpiritPanel（flag 门控）。
- Modify `apps/web/app/calendar/page.tsx` — 接入 AskToday（flag 门控）。
- Modify `apps/web/lib/profiles.ts` — `spirit_memory`/`questionnaire` 读写。
- Modify `apps/web/.env.example` — 记 `NEXT_PUBLIC_SPIRIT_ENABLED`。

**Pact 映射（worker 分配）**
- `claude`（核心代码）：core 全部 + llm 全部 + eval + DB migration + review/merge。
- `opencode`（deepseek-v4-pro，后端）：`/api/spirit/chat` 路由 + `apps/web/lib/spirit.ts` + profiles 读写。遇阻 → kimi 顶替。
- `kimi`（k2.7，前端）：SpiritPanel/SpiritSigil/AskToday/Questionnaire/SelfPortrait + 页面接线 + 素白水墨样式。

---

# Phase 1 — 灵的诞生与对话（pact feature: `spirit-p1`）

## Task 1.1（claude/core）：`deriveSpirit` 人格种子

**Files:**
- Create: `packages/core/src/spirit/index.ts`
- Test: `packages/core/src/spirit/index.test.ts`
- Modify: `packages/core/src/index.ts`（加 `export { deriveSpirit, type SpiritPersona } from "./spirit"`）

**Interfaces:**
- Consumes: `UnifiedChart`（`./types/chart`）、`deriveUsefulElements`(`./bazi/useful-elements`)、`deriveWesternProfile`(`./western/profile`)、`deriveTriad`(`./ziwei/triad`)。
- Produces:
```ts
export type SpiritPersona = {
  archetype: string;        // 原型标签（中英；en 为主，如 "Warden"）
  dominantElement: string;  // 主导五行 wood|fire|earth|metal|water
  toneHints: string[];      // 口吻提示，2-4 个
  anchorFacts: string[];    // 灵可引用的承重事实标签（命主星/福德/核心张力）
  coreTension: string;      // 核心成长课题（格林式，反思性，一句）
};
export function deriveSpirit(chart: UnifiedChart): SpiritPersona;
```

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { deriveSpirit } from "./index";
import { buildChart } from "../../test/fixtures"; // 若无 fixture，用既有 normalize+排盘构造（见 daily 测试如何造 chart）

describe("deriveSpirit", () => {
  it("从主导五行派生 dominantElement 且 toneHints 非空", () => {
    const chart = buildChart({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 });
    const s = deriveSpirit(chart);
    expect(["wood","fire","earth","metal","water"]).toContain(s.dominantElement);
    expect(s.toneHints.length).toBeGreaterThan(0);
    expect(s.archetype).toBeTruthy();
  });
  it("anchorFacts 只引用命盘已有字段（命主星/福德宫/张力之一）", () => {
    const chart = buildChart({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 });
    const s = deriveSpirit(chart);
    expect(s.anchorFacts.length).toBeGreaterThan(0);
  });
  it("西方盘缺失时仍可派生（退紫微命宫主星）", () => {
    const chart = buildChart({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47, noWestern: true });
    const s = deriveSpirit(chart);
    expect(s.archetype).toBeTruthy();
    expect(s.dominantElement).toBeTruthy();
  });
});
```
> 注：构造 chart 的方式以 `packages/core/src/daily/*.test.ts` 现有写法为准；worker 先 `grep -rn "buildChart\|UnifiedChart" packages/core/src/**/*.test.ts` 找现成 fixture，没有就直接调排盘入口构造。

- [ ] **Step 2: 跑测试确认失败** — `pnpm --filter @eamvp/core test spirit` → FAIL（deriveSpirit 未定义）。
- [ ] **Step 3: 实现 `deriveSpirit`**：取 `chart.bazi.fiveElementCounts` 峰为 dominantElement；命主星取 `deriveWesternProfile(w).chartRuler`（西方缺失退 `chart.ziwei` 命宫主星）；coreTension 取西方硬相位首条或生年化忌宫；archetype 由 dominantElement × 命主星十神映射表（一张 5×N 常量表，en 标签）；toneHints 由 dominantElement + 旺衰倾向映射。anchorFacts 收集命主星/福德宫主星/张力的文本标签。**纯函数、确定性、不调用 LLM。**
- [ ] **Step 4: 跑测试确认通过** — `pnpm --filter @eamvp/core test spirit` → PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(core): deriveSpirit 本命之灵人格种子派生 [EP-spirit-01]"`。

**验收：** 三类用例绿；`deriveSpirit` 不进冻结命盘；不同日主/五行 → 不同 archetype。

---

## Task 1.2（claude/llm）：灵 system prompt + 开场白生成

**Files:**
- Create: `packages/llm/src/spirit.ts`
- Test: `packages/llm/src/spirit.test.ts`
- Modify: `packages/llm/src/index.ts`

**Interfaces:**
- Consumes: `deriveSpirit`/`SpiritPersona`(`@eamvp/core`)、`extractFacts`(`./facts`)、`SYNTHESIS_GUARDRAILS`(`@eamvp/core`)、`buildSystemPrompt` 风格(`./prompt`)、`chat`/`chatStream`(`./client`)、`sanitizeReading`/`correctMutagens`、`resolveLlmConfig`/`isLlmConfigured`(`./provider`)。
- Produces:
```ts
export function buildSpiritSystemPrompt(persona: SpiritPersona, chart: UnifiedChart, language: ReadingLanguage): string;
export async function generateSpiritIntro(chart: UnifiedChart, opts?: SpiritOptions): Promise<{ text: string; model: string }>;
export type SpiritOptions = { language?: ReadingLanguage; nickname?: string; config?: LlmConfig; signal?: AbortSignal };
```

- [ ] **Step 1: 写失败测试**（mock LlmConfig，断言 prompt 组装而非真调用）

```ts
import { describe, it, expect } from "vitest";
import { buildSpiritSystemPrompt } from "./spirit";
import { deriveSpirit } from "@eamvp/core";
import { buildChart } from "../test/fixtures"; // 同 core，用既有方式构造

describe("buildSpiritSystemPrompt", () => {
  it("含人格种子 + 守护栏 + 第一人称指令", () => {
    const chart = buildChart({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 });
    const p = deriveSpirit(chart);
    const sys = buildSpiritSystemPrompt(p, chart, "en");
    expect(sys).toContain(p.archetype);
    expect(sys.toLowerCase()).toMatch(/first.person|i am|i will/);
    expect(sys).toMatch(/不预测|non-?determin|reflect/i); // 守护栏精神
  });
  it("只喂 extractFacts 事实，不含原始出生坐标", () => {
    const chart = buildChart({ date: "1991-03-15", time: "14:30", gender: "male", latitude: 31.23, longitude: 121.47 });
    const sys = buildSpiritSystemPrompt(deriveSpirit(chart), chart, "en");
    expect(sys).not.toContain("121.47");
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `pnpm --filter @eamvp/llm test spirit` → FAIL。
- [ ] **Step 3: 实现** `buildSpiritSystemPrompt`（人格种子 + `SYNTHESIS_GUARDRAILS` + 硬规则「只引用 facts 内星曜/相位、不预测吉凶、非决定论、反思性、第一人称、不臆造命盘」）与 `generateSpiritIntro`（system=上述，user=`extractFacts(chart)` + 「以第一人称用 2-3 句认领此命盘并邀请对话」；非流式 `chat`；过 `sanitizeReading`+`correctMutagens`；`logReadingMeta` 同款无 PII 观测）。
- [ ] **Step 4: 跑测试确认通过** → PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(llm): 灵 system prompt + 开场白生成 [EP-spirit-02]"`。

**验收：** prompt 含人格种子+守护栏；不含原始坐标；开场白只引用 facts；西方缺失走降级（沿用 sanitize）。

---

## Task 1.3（claude/db）：`spirit_messages` 表 + RLS migration

**Files:**
- Create: `supabase/migrations/0002_spirit_messages.sql`

**Interfaces:**
- Produces 表 `spirit_messages`：`id uuid pk default gen_random_uuid()`、`user_id uuid not null default auth.uid()`、`profile_id uuid not null references profiles(id) on delete cascade`、`role text not null check (role in ('user','spirit'))`、`content text not null`、`created_at timestamptz not null default now()`。索引 `(profile_id, created_at)`。

- [ ] **Step 1: 写 migration**（RLS：`enable row level security`；policy `using (user_id = auth.uid())` for select/insert/delete）。先确认现有 `profiles` 的 RLS 写法 → `grep -rn "policy\|row level" supabase/ 2>/dev/null`，无 migrations 目录则参照线上 profiles 策略命名。
- [ ] **Step 2: 本地 lint SQL**（人读校验：RLS 开启、policy 四操作齐、cascade、check 约束）。
- [ ] **Step 3: apply 到线上**（orchestrator 执行，见「DB 上线」节，Supabase MCP `apply_migration`）。
- [ ] **Step 4: 验证** — Supabase MCP `list_tables` 见 `spirit_messages`；`get_advisors` 无新增 security 警告（RLS 未开会报）。
- [ ] **Step 5: 提交** — `git commit -m "feat(db): spirit_messages 表 + RLS [EP-spirit-04]"`。

**验收：** 表存在、RLS 开启、advisor 无 security 警告、匿名会话隔离。

---

## Task 1.4（opencode/web-backend）：`/api/spirit/chat` SSE 路由 + 客户端数据层

**Files:**
- Create: `apps/web/app/api/spirit/chat/route.ts`
- Create: `apps/web/lib/spirit.ts`

**Interfaces:**
- Consumes: `streamSpiritChat`（Task 1.5 提供，见下；若 1.5 未就绪可先用 `generateSpiritIntro` 非流式打通，再换流式）、`extractFacts`、`supabase`/`ensureSession`(`./supabase`)、`getProfile`(`./profiles`)。
- Produces:
  - `route.ts`：`POST` body `{ profileId: string, messages: {role,content}[] }` → SSE text/event-stream，逐块吐 markdown（同 `/api/reading/route.ts` 模式）。先 `getProfile` 取冻结 chart → 组 system → 流式。
  - `lib/spirit.ts`：
```ts
export type SpiritMessage = { id: string; role: "user"|"spirit"; content: string; createdAt: string };
export async function listMessages(profileId: string): Promise<SpiritMessage[]>;
export async function appendMessage(profileId: string, role: "user"|"spirit", content: string): Promise<void>;
```

- [ ] **Step 1: 实现 `lib/spirit.ts`** — `listMessages`(select where profile_id order created_at asc)、`appendMessage`(insert，user_id 由 default auth.uid())。`ensureSession` 先行。参照 `lib/profiles.ts` 写法。
- [ ] **Step 2: 实现 `route.ts`** — 参照 `apps/web/app/api/reading/route.ts`：取 `resolveLlmConfig`，`getProfile(profileId)` 拿 chart，调 `streamSpiritChat(chart, messages, opts)`，`ReadableStream` 逐块 enqueue。错误 → 500 + JSON。
- [ ] **Step 3: 端到端验证** — 起 `pnpm --filter @eamvp/web dev`（:3030），先建一档案，`curl -N -X POST localhost:3030/api/spirit/chat -H 'content-type: application/json' -d '{"profileId":"<id>","messages":[{"role":"user","content":"who are you?"}]}'` → 见流式 markdown，无报错。
- [ ] **Step 4: 验证落库** — `listMessages` 返回刚插入消息（或在面板任务联调时验证）。
- [ ] **Step 5: 提交** — `git commit -m "feat(web): /api/spirit/chat SSE + spirit 数据层 [EP-spirit-04]"`。

**验收：** SSE 流式正常、消息落库、RLS 隔离、错误不泄露 stack。

---

## Task 1.5（claude/llm）：`streamSpiritChat` 多轮对话流

**Files:**
- Modify: `packages/llm/src/spirit.ts`（加 `streamSpiritChat`）
- Modify: `packages/llm/src/spirit.test.ts`

**Interfaces:**
- Produces:
```ts
export async function* streamSpiritChat(
  chart: UnifiedChart,
  history: { role: "user"|"spirit"; content: string }[],
  opts?: SpiritOptions & { memory?: string }
): AsyncGenerator<string>;
```
- Consumes: 同 1.2 + `chatStream`。`memory`（Phase 2 注入）拼进 system。`spirit` 角色映射为 assistant。

- [ ] **Step 1: 写失败测试** — 断言 history 映射（spirit→assistant、user→user）、system 含 facts、西方缺失走缓冲降级（mock chatStream 返回含杜撰西方词 → 输出被 sanitize 删除）。
- [ ] **Step 2: 跑测试确认失败** → FAIL。
- [ ] **Step 3: 实现** `streamSpiritChat`：system=`buildSpiritSystemPrompt`(+memory)，messages=facts 引导 + history（角色映射）；流式按行 `correctMutagens`（同 `streamReading`）；西方缺失全缓冲 sanitize 后一次吐。
- [ ] **Step 4: 跑测试确认通过** → PASS。
- [ ] **Step 5: 提交** — `git commit -m "feat(llm): streamSpiritChat 多轮对话流 [EP-spirit-04]"`。

**验收：** 角色映射正确、接地不越界、降级不泄露、四化纠正生效。

---

## Task 1.6（kimi/web-frontend）：命盘页灵开场白卡 + 对话面板 + 水墨印记

**Files:**
- Create: `apps/web/app/chart/SpiritSigil.tsx`
- Create: `apps/web/app/chart/SpiritPanel.tsx`
- Modify: `apps/web/app/chart/page.tsx`
- Modify: `apps/web/.env.example`

**Interfaces:**
- Consumes: `deriveSpirit`(`@eamvp/core`，客户端可调，纯函数)、`listMessages`/`appendMessage`(`@/lib/spirit`)、`/api/spirit/chat` SSE、活动档案 `getActiveProfile`(`@/lib/profiles`)。
- Produces:
  - `SpiritSigil({ element }: { element: string })` — 主导五行 → 一枚 SVG 水墨印记（5 种，素白水墨，无外部资源）。
  - `SpiritPanel({ profile })` — 顶部开场白卡（首次进入调 `generateSpiritIntro` 经一个轻 API 或复用 chat 路由 seed；MVP 可在面板挂载时 POST 一条 system-seed）+ 名号 + Sigil + 对话气泡列表 + 输入框 + 流式书写感（复用现有 SSE 读取方式，参照解读页流式渲染）。

- [ ] **Step 1: `SpiritSigil`** — 5 个五行 SVG 印记（wood/fire/earth/metal/water），Tailwind 4 令牌配色，素白水墨基调；快照式自检（视觉）。
- [ ] **Step 2: `SpiritPanel`** — 布局：印记+archetype 名号（`deriveSpirit(profile.chart)`）→ 开场白 → 气泡列表（`listMessages`）→ 输入框。发送：`appendMessage(user)` → fetch `/api/spirit/chat` 流式渲染 → 结束 `appendMessage(spirit)`。空态显示开场白。
- [ ] **Step 3: 接入 `page.tsx`** — flag 门控 `process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1"` 才渲染 SpiritPanel；放在解读区下方，不动现有解读。
- [ ] **Step 4: `.env.example`** — 加注 `NEXT_PUBLIC_SPIRIT_ENABLED=0 # 1 开启本命之灵`。
- [ ] **Step 5: 构建验证** — `NEXT_PUBLIC_SPIRIT_ENABLED=1 pnpm --filter @eamvp/web build` 通过；本地 :3030 实测对话往返、流式书写、移动/桌面响应式。
- [ ] **Step 6: 提交** — `git commit -m "feat(web): 命盘页本命之灵面板 + 水墨印记 [EP-spirit-03/04]"`。

**验收：** flag 关时零变化；flag 开时开场白+对话+印记正常；素白水墨；响应式；不破坏现有解读。

---

# Phase 2 — 关系记忆与每日问今（pact feature: `spirit-p2`）

## Task 2.1（claude/db）：`profiles.spirit_memory` 列

**Files:** Create `supabase/migrations/0003_spirit_memory.sql`（`alter table profiles add column spirit_memory jsonb`）。
- [ ] Step 1: 写 migration（可空、默认 null，不动 RLS）。
- [ ] Step 2: apply 到线上（Supabase MCP）。
- [ ] Step 3: 验证 `list_tables` 见新列；现有 profiles 读写不破。
- [ ] Step 4: 提交 `git commit -m "feat(db): profiles.spirit_memory 列 [EP-spirit-05]"`。

**验收：** 列存在、可空、现有档案不受影响。

## Task 2.2（claude/llm）：`summarizeSpiritMemory` 满窗摘要

**Files:** Modify `packages/llm/src/spirit.ts` + test。
**Interfaces:**
```ts
export async function summarizeSpiritMemory(
  history: { role: "user"|"spirit"; content: string }[],
  prior?: string,
  opts?: SpiritOptions
): Promise<string>; // 定长（≤ ~600 字）滚动摘要：关切主题/自陈情绪/反复议题；无 PII
```
- [ ] Step 1: 写失败测试 — 断言输出非空、不含坐标/出生时间字面、长度受限。
- [ ] Step 2: 跑确认失败。
- [ ] Step 3: 实现 — system「把对话提炼为关切主题/情绪/反复议题，无个人身份信息，≤N 字，合并 prior」；非流式 `chat`；截断保护。
- [ ] Step 4: 跑确认通过。
- [ ] Step 5: 提交 `git commit -m "feat(llm): summarizeSpiritMemory 关系记忆摘要 [EP-spirit-05]"`。

**验收：** 摘要无 PII、定长、可合并 prior。

## Task 2.3（opencode/web-backend）：记忆读写 + 会话结束触发摘要

**Files:** Modify `apps/web/lib/profiles.ts`（加 `getSpiritMemory`/`saveSpiritMemory`）、Modify `apps/web/lib/spirit.ts`（`endSession` 触发摘要）。
**Interfaces:**
```ts
// profiles.ts
export async function getSpiritMemory(profileId: string): Promise<string | null>;
export async function saveSpiritMemory(profileId: string, memory: string): Promise<void>;
```
- [ ] Step 1: 实现 profiles 读写（update spirit_memory）。
- [ ] Step 2: `/api/spirit/chat` 注入 memory（取 `getSpiritMemory` → 传 `streamSpiritChat` opts.memory）。
- [ ] Step 3: 会话结束（面板卸载/显式按钮）调用一个轻 API 或客户端编排：`listMessages` → `summarizeSpiritMemory` → `saveSpiritMemory`。摘要走服务端（key 在服务端），加 `POST /api/spirit/memory` 路由。
- [ ] Step 4: 端到端验证 — 两段会话，第二段灵能引用第一段话题。
- [ ] Step 5: 提交 `git commit -m "feat(web): 关系记忆读写 + 会话摘要触发 [EP-spirit-05]"`。

**验收：** 跨会话引用既往话题；记忆持久化；token 受控。

## Task 2.4（claude/llm + kimi/web）：每日问今

**Files:** Modify `packages/llm/src/spirit.ts`（`generateDailySpiritGreeting`）+ test；Create `apps/web/app/calendar/AskToday.tsx`；Modify `apps/web/app/calendar/page.tsx`。
**Interfaces:**
```ts
export async function generateDailySpiritGreeting(
  chart: UnifiedChart, daily: DailyFortune, dateStr: string, opts?: SpiritOptions & { memory?: string }
): Promise<{ text: string; model: string }>;
```
- [ ] Step 1（claude/llm）: 写失败测试 — greeting 只引用 daily 的确定性五维/干支，不臆造分数。
- [ ] Step 2: 实现 `generateDailySpiritGreeting`（system=灵人格+守护栏，user=`computeDailyFortune` 五维+今日干支+memory；第一人称 2-3 句）。测试通过。提交。
- [ ] Step 3（kimi/web）: `AskToday.tsx` — 日历顶部灵第一人称问候卡 + 「Ask today」CTA → 跳/开对话面板（seed=今日上下文）。素白水墨，接现有水墨配图区。
- [ ] Step 4: `calendar/page.tsx` flag 门控接入；构建 + :3030 实测每日变化。
- [ ] Step 5: 提交 `git commit -m "feat: 每日问今 [EP-spirit-06]"`。

**验收：** 复用确定性五维不臆造；每日变化；flag 门控；接现有日历水墨。

---

# Phase 3 — 心理问卷 + 自我画像演化（pact feature: `spirit-p3`）

## Task 3.1（claude/db）：`profiles.questionnaire` 列

**Files:** Create `supabase/migrations/0004_profile_questionnaire.sql`（`alter table profiles add column questionnaire jsonb`）。
- [ ] Step 1: 写 migration（可空）。Step 2: apply 线上。Step 3: 验证。Step 4: 提交 `git commit -m "feat(db): profiles.questionnaire 列 [EP-profile-q]"`。

**验收：** 列存在、可空。

## Task 3.2（kimi/web + claude/core 定义题库）：最小心理问卷 EP-profile-q MVP

**Files:** Create `packages/core/src/spirit/questionnaire.ts`（题库常量 + 类型）+ export；Create `apps/web/app/profiles/Questionnaire.tsx`；Modify `apps/web/lib/profiles.ts`（`saveQuestionnaire`/`getQuestionnaire`）。
**Interfaces:**
```ts
// core
export type QuestionnaireItem = { id: string; prompt: string; options: { value: string; label: string }[] };
export const PROFILE_QUESTIONNAIRE: QuestionnaireItem[]; // 3-5 题：精力来源/决策风格/压力反应/成长关切/当下议题
export type QuestionnaireAnswers = Record<string, string>;
// profiles.ts
export async function saveQuestionnaire(profileId: string, answers: QuestionnaireAnswers): Promise<void>;
export async function getQuestionnaire(profileId: string): Promise<QuestionnaireAnswers | null>;
```
- [ ] Step 1（claude/core）: 定义 3-5 题题库（en，反思性、非临床），导出。轻单测（题数/字段完整）。提交。
- [ ] Step 2（kimi/web）: `Questionnaire.tsx` 单选流，提交存 `saveQuestionnaire`。素白水墨，flag 门控。
- [ ] Step 3: 构建验证。提交 `git commit -m "feat: 最小心理问卷 EP-profile-q MVP [EP-profile-q]"`。

**验收：** 问卷可答可存；非临床、反思性文案。

## Task 3.3（claude/llm）：问卷并入灵上下文（EP-spirit-07）

**Files:** Modify `packages/llm/src/spirit.ts`（`buildSpiritSystemPrompt` 接受可选 `questionnaire` 摘要）+ test。
- [ ] Step 1: 写失败测试 — 传 answers 时 system 含「自陈」段且影响（出现答案相关线索）。
- [ ] Step 2-4: 实现（answers → 简短自陈描述拼入 system，标注「用户自陈，主观」）；测试通过。
- [ ] Step 5: opencode/web：`/api/spirit/chat` 与 daily greeting 注入 `getQuestionnaire`。提交 `git commit -m "feat: 问卷并入灵上下文 [EP-spirit-07]"`。

**验收：** 答案进 system、影响对话；标注主观自陈。

## Task 3.4（claude/core + kimi/web）：自我画像可视化（EP-spirit-08）

**Files:** Create `packages/core/src/spirit/portrait.ts`（`deriveSelfPortrait`）+ test + export；Create `apps/web/app/chart/SelfPortrait.tsx`；Modify `apps/web/app/chart/page.tsx`。
**Interfaces:**
```ts
export type SelfPortrait = {
  dimensions: { key: string; label: string; value: number }[]; // 0..10，五维基线 + 时序调制
  dominantElement: string;
  note: string; // 反思性一句，非预测
};
export function deriveSelfPortrait(chart: UnifiedChart, opts?: { memoryPresent?: boolean; questionnaire?: QuestionnaireAnswers }): SelfPortrait;
```
- [ ] Step 1（claude/core）: 写失败测试 — dimensions 非空、value 在 0..10、确定性。
- [ ] Step 2-3: 实现 `deriveSelfPortrait`（复用 `computeDailyFortune` 五维思路 + `deriveWesternProfile` 元素/模式 + 时序声部信号；问卷/记忆存在时微调权重）。纯函数。测试通过。提交。
- [ ] Step 4（kimi/web）: `SelfPortrait.tsx` — 能量图鉴式水墨雷达/条图（无重库，SVG/Tailwind）；flag 门控接命盘页。构建验证。
- [ ] Step 5: 提交 `git commit -m "feat: 自我画像可视化 [EP-spirit-08]"`。

**验收：** 画像随问卷/记忆/时序变化；on-brand 水墨；纯函数可测。

---

# 编排与上线（orchestrator: claude）

## Pact 流程
1. `pactify status` → `pactify join claude --roles orchestrator,reviewer,worker`（或 MCP `join`）。
2. 建三个 feature：`spirit-p1`/`spirit-p2`/`spirit-p3`（pact `assign` 按 task→worker 映射；owner≠reviewer：worker 实现，claude review/accept）。
3. 并行调度：core/llm 任务 claude 自做；web-backend 派 opencode，web-frontend 派 kimi。worker 调用：
   - kimi：`kimi -p "<task 指令含文件/接口/验收>" --yolo`（前端任务）
   - opencode：`opencode run "<task 指令>"`（后端任务）；遇阻（报错/卡住/产出不符）→ 转 `kimi -p` 顶替。
4. worker 完成 → checkpoint（awaiting_review + 证据）→ claude reviewer 验 diff+证据+跑测试 → accept / changes_requested。
5. feature 全 task accepted → merge。

## 两条铁律
- worker 不能自 accept（claude 作 reviewer 接受）。
- feature 全 task accepted 前不 merge。

## DB 上线（已授权直接对线上）
- migration-first：先写 `.sql`，再 Supabase MCP `apply_migration`（project 见 deployment-infra 记忆）。每次 apply 后 `list_tables` + `get_advisors` 验 RLS 无 security 警告。

## 合并与发布（已定：合 main + flag 默认关）
- 每 phase 全 accepted → 合 main。`NEXT_PUBLIC_SPIRIT_ENABLED` 默认不设（=关），生产 Vercel 自动部署但灵入口不可见，尊重 MVP 冻结。
- 合 main 前：`pnpm --filter @eamvp/core test` + `pnpm --filter @eamvp/llm test` + `pnpm --filter @eamvp/web build` 全绿（verification-before-completion）。
- 全部完成后更新 `.agent/CURRENT.md`（Version History + Sprint Summary）。

## 验证纪律（standard 检查点）
- 标 ✅ Done 前用 `superpowers:verification-before-completion`：先跑命令、贴输出、再宣称通过。
- 灵对话是新幻觉面：EP-spirit-02/04 必扩 `packages/llm/src/eval/cases.ts`，eval 跑过（不臆造星曜、不预测吉凶）。

## 失败回退
- worker 连续 2-3 次产出不符 → orchestrator 自接管该 task。
- opencode 不可用 → kimi 顶替（前后端 kimi 都能做）。
- LLM 限流 → 复用 `withRetry`；真不可用则该端到端验证降级为单测+人读，标注 pending。
