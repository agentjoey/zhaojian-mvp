# 照见 Telegram 前端 · P3（每日推送）Implementation Plan

> 执行者 `kimi`，reviewer `claude`。kimi 只改列出文件、不 commit、不执行 Supabase/Vercel 命令、密钥只读 env。本地/集成验证由 claude（启 dev 前 `set -a; . ./apps/web/.env.local; set +a`）。

**Goal:** 让订阅用户每天在设定时刻收到 bot 主动推送的「今日运势 + 问今」。
**Architecture:** Vercel Cron（每小时）→ `/api/tg/cron`（校验 CRON_SECRET）→ 选出本地时刻命中且 `daily_push=true` 的 `tg_users` → 用 `bot.api.sendMessage(chat_id, ...)` 推送。bot 加 `/subscribe`/`/unsubscribe`/`/settings`。
**Tech Stack:** Vercel Cron · grammY `bot.api` · `@eamvp/core` computeDailyFortune · `@eamvp/llm` generateDailySpiritGreeting · service-role。

## Global Constraints
- 推送内容：`computeDailyFortune`（确定性，免费）+ `generateDailySpiritGreeting`（LLM）。**推送是产品赠予，不消耗用户免费畅聊额度**；靠「订阅制 + 每用户每天至多一次」控成本。
- 限流：Telegram 全局 30 msg/s、单 chat 1 msg/s；cron 串行 + 每条间隔小睡；LLM（MiniMax RPM~200）当前用户量低，串行足够；失败单用户跳过不阻断整批。
- 幂等：同一用户同一天只推一次（用 `tg_users.last_push_date` 标记）。
- 时区：按 `tg_users.tz` 算本地小时，命中 `push_hour` 才推。
- 不碰非 TG web；密钥仅 env（新增 `CRON_SECRET`）。

## File Structure（P3）
- Create `supabase/migrations/0007_tg_push_state.sql` — `tg_users.last_push_date date`（kimi 写、claude apply）。
- Modify `apps/web/lib/tg/bot.ts` — `/subscribe` `/unsubscribe` `/settings`（设 daily_push/push_hour/tz + 存 chat_id）。
- Create `apps/web/lib/tg/push.ts` — `dueUsers(nowUtcISO)` 选取 + `pushDailyTo(user)` 组装并发送（service-role + bot.api）。
- Create `apps/web/app/api/tg/cron/route.ts` — 校验 CRON_SECRET → 遍历 dueUsers → pushDailyTo。
- Create/Modify `apps/web/vercel.json`（或根 `vercel.json`）— crons 配置（每小时）。
- Modify `apps/web/.env.example` — 记 `CRON_SECRET`。

**Pact** feature `tg-p3`。

---

## Task 1（kimi 写 SQL / claude apply）：推送状态列
**Files:** Create `supabase/migrations/0007_tg_push_state.sql`
```sql
alter table public.tg_users add column if not exists last_push_date date;
```
- [ ] kimi 写 SQL；claude apply（name `tg_push_state`）+ 验列在。提交 `feat(db): tg_users.last_push_date [EP-tg-P3-1]`。

## Task 2（kimi）：订阅命令
**Files:** Modify `apps/web/lib/tg/bot.ts`
- [ ] Step 1: 加 `bot.command("subscribe", ...)`：resolveOrCreateTgUser(含 chat.id) → `supabaseAdmin().from("tg_users").update({daily_push:true, tg_chat_id: ctx.chat.id}).eq("tg_user_id", u.id)` → reply「已订阅每日运势（默认每天早 8 点，可 /settings 调整）。」。需在 bot.ts import `supabaseAdmin` from "./admin"。
- [ ] Step 2: `bot.command("unsubscribe", ...)`：update daily_push=false → reply「已取消每日推送。」。
- [ ] Step 3: `bot.command("settings", ...)`：解析参数 `/settings 9`（小时 0-23）或 `/settings 9 Asia/Shanghai`：update push_hour（和 tz 若给）→ reply 当前设置；无参数则回显当前 daily_push/push_hour/tz（先 select）。
- [ ] Step 4: build。提交 `feat(tg): /subscribe /unsubscribe /settings [EP-tg-P3-2]`。
**验收：** 三命令改 tg_users 对应字段并回执；build 通过。

## Task 3（kimi）：推送逻辑
**Files:** Create `apps/web/lib/tg/push.ts`
**Produces:**
```ts
export async function dueUsers(now: Date): Promise<{ tg_user_id:number; tg_chat_id:number; tz:string; push_hour:number; supabase_user_id:string }[]>;
export async function pushDailyTo(u: {...}): Promise<boolean>; // 组装今日内容并 bot.api.sendMessage；成功后置 last_push_date=今日(本地)；已推过则跳过返回 false
```
- [ ] Step 1: `dueUsers(now)`：select tg_users where daily_push=true and tg_chat_id is not null。对每个用户：用 `Intl.DateTimeFormat("en-CA",{timeZone:tz,hour:"numeric",hour12:false})` 等算其本地 hour 与本地 date；筛 `localHour===push_hour && last_push_date !== localDate`。返回命中者（带 localDate 供写回）。
- [ ] Step 2: `pushDailyTo(u)`：getProfileForUser(u.supabase_user_id)；无 profile→跳过。computeDailyFortune(chart, localDate)；generateDailySpiritGreeting(chart, daily, localDate, {language:"zh", memory})（**不**走 consumeQuota）；组中文消息（干支+五维概要+问今）；`getBot().api.sendMessage(u.tg_chat_id, text)`；成功后 update last_push_date=localDate。try/catch 单用户失败返回 false 不抛。
- [ ] Step 3: build。提交 `feat(tg): 每日推送逻辑(dueUsers/pushDailyTo) [EP-tg-P3-3]`。
**验收：** 选取按 tz/push_hour/幂等正确；发送+写回 last_push_date。

## Task 4（kimi）：Cron 路由 + vercel.json
**Files:** Create `apps/web/app/api/tg/cron/route.ts`、`apps/web/vercel.json`（若已存在则改）
- [ ] Step 1: `cron/route.ts`（runtime nodejs, dynamic force-dynamic）：
  - 校验：`req.headers.get("authorization") === "Bearer " + process.env.CRON_SECRET`（Vercel Cron 会带）；不符 401。
  - `const now = new Date(); const due = await dueUsers(now); let sent=0; for (const u of due) { if (await pushDailyTo(u)) sent++; }` → `Response.json({ due: due.length, sent })`。
- [ ] Step 2: `vercel.json`：`{ "crons": [{ "path": "/api/tg/cron", "schedule": "0 * * * *" }] }`（每小时整点）。若仓库已有 vercel.json，合并 crons 字段（勿破坏既有）。
- [ ] Step 3: build。提交 `feat(tg): /api/tg/cron + vercel.json 每日推送调度 [EP-tg-P3-4]`。
**验收：** 带 CRON_SECRET 调用 200 返回 {due,sent}；无 secret 401。

## P3 上线（claude）
- 配 Vercel env `CRON_SECRET`（生成随机值）。合 main → push。
- 集成验证：本地带 `Authorization: Bearer <CRON_SECRET>` curl `/api/tg/cron`（先临时把自己设为 due：daily_push=true、push_hour=当前本地小时、last_push_date=null）→ 收到推送。
- 真机：`/subscribe` 后到点收推送（或手动触发 cron 验证）。
- 更新 CURRENT.md + memory。

## 编排
owner kimi / reviewer claude（pact `tg-p3`）。波次：T1（DB）+T2（命令）并行 → T3（push）→ T4（cron）。claude apply 迁移、配 CRON_SECRET、build、curl、提交、accept、合并、部署。
