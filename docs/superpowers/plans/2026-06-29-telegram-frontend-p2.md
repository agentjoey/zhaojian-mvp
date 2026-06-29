# 照见 Telegram 前端 · P2（Bot DM 对话 + /today + 免费额度 + Mini App 读盘）Implementation Plan

> **For agentic workers:** 执行者 = `kimi`，reviewer = `claude`。步骤用 `- [ ]`。
> ⚠️ kimi：只改本计划文件；**不 commit**（claude review+构建后提交）；**不执行 Supabase 迁移**（写 `.sql`，claude apply）；密钥只读 env。
> ⚠️ 本地 dev/集成验证由 claude 做，且**必须 `set -a; . ./apps/web/.env.local; set +a` 后再启 dev**（避免 profile 里的旧 TELEGRAM_BOT_TOKEN 覆盖，见 P1 教训）。

**Goal:** 让 Telegram bot 在 DM 里原生与本命之灵对话、`/today` 报今日运势问今，受免费 LLM 额度约束；并让 Mini App 在 Telegram 内能读取命盘/灵/日历（补齐 P1 起盘后 /chart 空白）。

**Architecture:** 延续 P1 后端中介（service_role）。Bot DM 复用 `@eamvp/llm` 引擎（服务端缓冲非流式回复）。Mini App 在 `isTelegram()` 下数据读写改走 `/api/tg/*`（而非浏览器直连 Supabase）。免费额度：确定性免费、LLM 动作计入 `tg_users.llm_uses`/`free_llm_quota`。

**Tech Stack:** grammY · `@eamvp/core`/`@eamvp/llm` · Supabase service-role + Postgres RPC · Next Route Handlers。

## Global Constraints
- 沿用 P1：`/api/tg/*` runtime nodejs；service_role 仅服务端；非 TG web 路径零改（所有 Mini App 改动包在 `isTelegram()` 分支）。
- 排盘/五维确定性免费；**仅 LLM 动作**（灵对话每轮、问今 LLM、完整解读）计入额度。额度耗尽 → 友好中文提示（计费 P 后续）。
- 语言全程简体中文。
- 反幻觉链沿用（streamSpiritChat 内部已含 facts/守护栏/sanitize/correctMutagens）。
- 测试：core 纯函数单测；路由/bot 用 curl + 真机；`pnpm --filter @eamvp/web build` 必过。

---

## File Structure（P2）
- Create `supabase/migrations/0006_llm_quota_rpc.sql` — `consume_llm_credit` RPC（kimi 写，claude apply）。
- Create `apps/web/lib/tg/data.ts` — service-role 数据层：spirit 消息读写、memory、questionnaire、daily 所需读取（按 supabase_user_id / profile）。
- Create `apps/web/lib/tg/quota.ts` — `consumeQuota(tgUserId)` / `quotaStatus(tgUserId)`（调 RPC）。
- Modify `apps/web/lib/tg/bot.ts` — 加 `message:text` 处理器（灵对话）+ `today` 命令。
- Create `apps/web/app/api/tg/spirit/route.ts` — GET 列消息 / POST 发消息（Mini App 灵面板，TG 内）。
- Create `apps/web/app/api/tg/daily/route.ts` — POST 今日运势+问今（Mini App 日历，TG 内）。
- Create `apps/web/app/api/tg/questionnaire/route.ts` — GET/POST 问卷（TG 内）。
- Modify `apps/web/lib/tg/client.ts` — 加 TG 数据 fetch 辅助（`tgGetProfile`/`tgListMessages`/`tgSendMessage`/`tgDaily`/`tgGetQuestionnaire`/`tgSaveQuestionnaire`）。
- Modify `apps/web/app/chart/page.tsx`、`apps/web/app/chart/SpiritPanel.tsx`、`apps/web/app/calendar/page.tsx`、`apps/web/app/calendar/AskToday.tsx`、`apps/web/app/chart/Questionnaire.tsx` — `isTelegram()` 下数据走 `/api/tg/*`。

**Pact**：feature `tg-p2`，owner kimi、reviewer claude。

---

# Block A — Bot DM 对话 + /today + 额度（后端）

## Task A1（kimi 写 SQL / claude apply）：额度 RPC

**Files:** Create `supabase/migrations/0006_llm_quota_rpc.sql`

```sql
-- EP-tg-P2 · 原子消费一次 LLM 额度：未超则 llm_uses+1 返回 true，超则返回 false（不增）
create or replace function public.consume_llm_credit(p_tg_user_id bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used int; v_quota int;
begin
  select llm_uses, free_llm_quota into v_used, v_quota
    from public.tg_users where tg_user_id = p_tg_user_id for update;
  if v_used is null then return false; end if;       -- 无此用户
  if v_used >= v_quota then return false; end if;     -- 额度耗尽
  update public.tg_users set llm_uses = llm_uses + 1 where tg_user_id = p_tg_user_id;
  return true;
end;
$$;
```

- [ ] Step 1: kimi 写上述 `.sql`。
- [ ] Step 2: claude apply（Supabase MCP `apply_migration` name `llm_quota_rpc`）。
- [ ] Step 3: claude 验：`select consume_llm_credit(<某测试 tg id>)` 行为（在测试 tg_user 上多次调用，达 quota 后返回 false）。
- [ ] Step 4: 提交（claude）`feat(db): consume_llm_credit 额度 RPC [EP-tg-P2-A1]`

**验收：** RPC 原子自增、超额返 false、无用户返 false。

## Task A2（kimi）：service-role 数据层 + 额度 helper

**Files:** Create `apps/web/lib/tg/data.ts`、`apps/web/lib/tg/quota.ts`

**Interfaces — Produces:**
```ts
// quota.ts
export async function consumeQuota(tgUserId: number): Promise<boolean>;     // 调 RPC
export async function quotaStatus(tgUserId: number): Promise<{ used: number; limit: number }>;
// data.ts （全部 service-role，按 profileId / supabaseUserId）
export type SpiritMsg = { id: string; role: "user"|"spirit"; content: string; createdAt: string };
export async function listMessages(profileId: string): Promise<SpiritMsg[]>;
export async function appendMessage(profileId: string, role: "user"|"spirit", content: string): Promise<void>;
export async function getMemory(profileId: string): Promise<string | null>;
export async function saveMemory(profileId: string, memory: string): Promise<void>;
export async function getQuestionnaire(profileId: string): Promise<Record<string,string> | null>;
export async function saveQuestionnaire(profileId: string, answers: Record<string,string>): Promise<void>;
```
**Consumes:** `supabaseAdmin()`（lib/tg/admin.ts）。表/列同既有（`spirit_messages`、`profiles.spirit_memory`/`questionnaire`）。

- [ ] Step 1: `quota.ts` — `consumeQuota`: `supabaseAdmin().rpc("consume_llm_credit", { p_tg_user_id: tgUserId })` 返回 boolean；`quotaStatus`: select llm_uses/free_llm_quota。
- [ ] Step 2: `data.ts` — 按 P1 `lib/tg/identity.ts` 同款 service-role 查询实现上述函数（spirit_messages 按 profile_id；profiles 按 id 读写 spirit_memory/questionnaire）。
- [ ] Step 3: `pnpm --filter @eamvp/web build` 通过。
- [ ] Step 4: 提交（claude）`feat(tg): 额度 helper + service-role 数据层 [EP-tg-P2-A2]`

**验收：** TS 通过；函数签名如上。

## Task A3（kimi）：Bot DM 灵对话 + /today

**Files:** Modify `apps/web/lib/tg/bot.ts`
**Consumes:** `getProfileForUser`/`resolveOrCreateTgUser`(identity)、`listMessages`/`appendMessage`/`getMemory`/`saveMemory`/`getQuestionnaire`(data)、`consumeQuota`(quota)、`@eamvp/llm` 的 `streamSpiritChat`/`summarizeSpiritMemory`/`generateDailySpiritGreeting`、`@eamvp/core` 的 `computeUnifiedChart`? 否——chart 已在 profile.chart；`computeDailyFortune`、`formatQuestionnaire`。

- [ ] Step 1: 加 `bot.command("today", ...)`：
  - resolve user → `getProfileForUser`；无 → `ctx.reply("先发 /start 起盘，我才能为你看今日。")`。
  - `const daily = computeDailyFortune(profile.chart, todayYmd())`（确定性，先发五维概要）。
  - `await ctx.replyWithChatAction("typing")`；若 `await consumeQuota(tgId)`：`generateDailySpiritGreeting(profile.chart, daily, dateStr, {language:"zh", memory, questionnaire})` → reply 问今；否则只回确定性五维 + 友好「今日免费问今已用完」。
  - `todayYmd()`：用 `new Date()` 拼 YYYY-MM-DD（bot 运行时，非 workflow，可用 Date）。
- [ ] Step 2: 加 `bot.on("message:text", ...)`（排除以 `/` 开头的命令，grammY 中 command 已优先匹配；此处处理普通文本）：
  - resolve user → profile；无 → 引导 /start 起盘。
  - 文本 = ctx.message.text。`await ctx.replyWithChatAction("typing")`。
  - 额度：`if (!(await consumeQuota(tgId)))` → reply「你的免费畅聊额度已用完——订阅即将开放，先以你已有的解读慢慢回味。」return。
  - 载入 `history = (await listMessages(profile.id))`（取末 ~12 条）、`memory`、`questionnaire`(formatQuestionnaire)。
  - `let full=""; for await (const c of streamSpiritChat(profile.chart, [...history.map(toTurn), {role:"user",content:text}], {language:"zh", memory, questionnaire: q})) full+=c;`
  - `await appendMessage(profile.id,"user",text); await appendMessage(profile.id,"spirit",full); await ctx.reply(full, {parse_mode 可选});`
  - fire-and-forget：`summarizeSpiritMemory(history+[...], memory).then(m=>m&&saveMemory(profile.id,m))`（捕获异常）。
- [ ] Step 3: claude 真机/集成验证（部署后 DM 发文本 → 灵中文接地回复；/today → 运势+问今；额度耗尽→提示）。本地可对 webhook 灌一条伪 message 更新（带 secret）验证不报错，但真实回复需真 chat。
- [ ] Step 4: 提交（claude）`feat(tg): bot DM 灵对话 + /today + 额度 [EP-tg-P2-A3]`

**验收：** DM 文本→灵中文接地回复（落库+记忆）；/today→五维+问今；额度闸生效；无 profile 引导起盘。

---

# Block B — Mini App 在 TG 内读盘（前后端中介）

## Task B1（kimi）：TG 数据路由

**Files:** Create `apps/web/app/api/tg/spirit/route.ts`、`apps/web/app/api/tg/daily/route.ts`、`apps/web/app/api/tg/questionnaire/route.ts`
**Consumes:** `readSession`/`TG_COOKIE`(session)、`getProfileForUser`(identity)、`data.ts`、`quota.ts`、`@eamvp/llm`、`computeDailyFortune`(core)。
**鉴权:** 同 P1 profile 路由——读 `TG_COOKIE` cookie → `readSession` → uid；无 → 401。

- [ ] Step 1: `spirit/route.ts`：
  - GET：uid → profile → `listMessages(profile.id)` → `{messages}`。
  - POST `{messages:[{role,content}]}`：uid→profile；额度 `consumeQuota(session.tgId)`（注意 readSession 返回 {uid,tgId}）→ 不足 402 + JSON `{error:"quota"}`；否则取 memory/questionnaire → `streamSpiritChat` 缓冲为文本（或 SSE，与 web /api/spirit/chat 一致逐块）→ 落库 user+spirit → 返回/流。建议与 web 一致流式（text/plain 逐块）。
- [ ] Step 2: `daily/route.ts`：POST `{dateStr}`：uid→profile→`computeDailyFortune`（免费）；额度允许则 `generateDailySpiritGreeting`→`{daily, greeting}`；否则 `{daily, greeting:null}`。
- [ ] Step 3: `questionnaire/route.ts`：GET uid→`getQuestionnaire`；POST `{answers}`→`saveQuestionnaire`。
- [ ] Step 4: claude 集成验证（带 cookie curl 三路由）。
- [ ] Step 5: 提交（claude）`feat(tg): /api/tg/{spirit,daily,questionnaire} 读写路由 [EP-tg-P2-B1]`

**验收：** 带 cookie 三路由 200；额度不足 402；未登录 401。

## Task B2（kimi）：client.ts TG 数据辅助

**Files:** Modify `apps/web/lib/tg/client.ts`
**Produces:**
```ts
export async function tgGetProfile(): Promise<any | null>;           // GET /api/tg/profile
export async function tgListMessages(): Promise<{id,role,content,createdAt}[]>;
export async function tgSpiritStream(messages, onChunk: (s:string)=>void): Promise<string>; // POST /api/tg/spirit 流式读
export async function tgDaily(dateStr: string): Promise<{daily:any, greeting:string|null}>;
export async function tgGetQuestionnaire(): Promise<Record<string,string>|null>;
export async function tgSaveQuestionnaire(answers: Record<string,string>): Promise<void>;
```
全部 `credentials:"include"`，先 `ensureTgSession()`（幂等）。
- [ ] Step 1-2: 实现上述（fetch /api/tg/*）。流式读复用 P1 SpiritPanel 的 reader 模式。
- [ ] Step 3: build 通过。提交（claude）`feat(tg): client TG 数据辅助 [EP-tg-P2-B2]`

**验收：** TS 通过；签名如上。

## Task B3（kimi）：Mini App 页面 TG 分支接线

**Files:** Modify `apps/web/app/chart/page.tsx`、`apps/web/app/chart/SpiritPanel.tsx`、`apps/web/app/chart/Questionnaire.tsx`、`apps/web/app/calendar/page.tsx`、`apps/web/app/calendar/AskToday.tsx`
**原则:** 仅在 `isTelegram()` 为真时改走 `/api/tg/*`；否则现状（web 匿名+RLS）零改。

- [ ] Step 1: `chart/page.tsx`：加载 profile 时 `isTelegram() ? await tgGetProfile() : await getActiveProfile()`；qAnswers 同理 `tgGetQuestionnaire()`。
- [ ] Step 2: `SpiritPanel.tsx`：`isTelegram()` 时消息列表用 `tgListMessages()`、发送用 `tgSpiritStream()`（替代 listMessages/appendMessage/直接 fetch /api/spirit/chat）；额度 402 时显示友好提示。
- [ ] Step 3: `Questionnaire.tsx`：`isTelegram()` 时保存走 `tgSaveQuestionnaire()`。
- [ ] Step 4: `calendar/page.tsx`+`AskToday.tsx`：`isTelegram()` 时 profile 走 `tgGetProfile()`、问今走 `tgDaily(dateStr)`（替代 dailyFortuneAction/dailySpiritGreetingAction + getActiveProfile）。
- [ ] Step 5: build 通过 + claude 真机验证（Mini App 内 /chart 见命盘、/spirit 可对话、/calendar 见问今）。
- [ ] Step 6: 提交（claude）`feat(tg): Mini App 页面 TG 读盘接线 [EP-tg-P2-B3]`

**验收：** TG 内 /chart 显示命盘、/spirit 对话可用且额度生效、/calendar 问今可用；非 TG web 零变化；build 通过。

---

## P2 上线
- 全 task accepted + core 测/web build 全绿 → 合 main → push（Vercel 自动部署；prod env 已配 P1）。
- claude 真机回归：DM 对话/`/today`/Mini App 读盘。
- 更新 `.agent/CURRENT.md` + memory [[feat-telegram-frontend]]。

## 编排
- owner kimi / reviewer claude（pact `tg-p2`）。波次：A1+A2（DB+数据层）→ A3（bot）→ B1（路由）→ B2（client）→ B3（页面）。claude 负责 apply 迁移、build、curl/真机、提交、accept、合并、部署。
