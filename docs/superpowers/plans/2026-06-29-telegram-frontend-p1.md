# 照见 Telegram 前端 · P1（骨架 + 身份 + 起盘闭环）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 按本计划逐 task 实现，步骤用 `- [ ]`。**执行者 = worker `kimi`**；**reviewer = `claude`**。
> ⚠️ kimi 约束：只改本计划列出的文件；**不要 commit**（claude review+构建后提交）；**不要执行 Supabase 迁移**（写好 `.sql`，由 claude 用 MCP apply）；密钥只从 env 读，绝不硬编码、绝不写进会提交的文件。

**Goal:** 让用户在 Telegram 里通过 `/start` 唤起照见 Mini App，完成「起盘 → 命盘建档」闭环；建立 Telegram 身份（后端中介 + service_role）。

**Architecture:** 方案 A（bot 寄宿 `apps/web`）。grammY webhook = Next 路由；Mini App = 现有 Next 应用 + Telegram 适配层。身份：验 `initData`(bot token HMAC) → 短时签名 cookie → 服务端用 `SUPABASE_SERVICE_ROLE_KEY` 绕 RLS 按 `tg_user_id` 操作（**Telegram 路径不走浏览器直连 Supabase**）。

**Tech Stack:** Next 16 (App Router, Route Handlers) · grammY · @supabase/supabase-js（service-role 客户端）· `@eamvp/core`(排盘) · Node `crypto` · Vitest。

## Global Constraints
- **不碰现有 web 冻结面**：所有新增在 `apps/web/lib/tg/*` 与 `apps/web/app/api/tg/*`；Mini App 适配走运行时检测（`window.Telegram?.WebApp`），非 Telegram 环境零行为变化。
- **密钥仅 env**：`TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `SUPABASE_SERVICE_ROLE_KEY`（均已在 `apps/web/.env.local`，gitignored）；`NEXT_PUBLIC_SUPABASE_URL` 已有。`service_role` key **绝不出现在客户端 bundle**（只在 route handler / server 用，不加 `NEXT_PUBLIC_`）。
- **排盘不许 LLM 算**：起盘仍用 `computeUnifiedChart`（确定性）。
- **语言**：全程简体中文（与 app 一致）。
- **测试**：纯函数 util 用 Vitest（`apps/web` 若无 vitest 配置，则放进 `packages/core` 或新建 `apps/web/vitest.config.ts`；优先在 `packages/core` 加可复用纯函数+单测）；路由用 `curl` 对本地 dev(:3030) 集成验证；构建 `pnpm --filter @eamvp/web build` 必过。
- **runtime**：所有 `/api/tg/*` 路由 `export const runtime = "nodejs"`（需 Node crypto + service_role）。

---

## File Structure（P1）
- Create `apps/web/lib/tg/initData.ts` — `verifyInitData(initData, botToken)`：HMAC 校验 Telegram WebApp initData。
- Create `apps/web/lib/tg/session.ts` — `signSession`/`verifySession`（HMAC，密钥 `TELEGRAM_WEBHOOK_SECRET`）+ cookie 名常量。
- Create `apps/web/lib/tg/admin.ts` — service-role Supabase 客户端单例（`supabaseAdmin()`）。
- Create `apps/web/lib/tg/identity.ts` — `resolveOrCreateTgUser`、`getProfileForUser`、`createProfileForUser`（全用 service-role）。
- Create `apps/web/lib/tg/bot.ts` — grammY `Bot` 实例 + `/start` 等处理器（懒初始化）。
- Create `apps/web/app/api/tg/webhook/route.ts` — grammY webhookCallback + secret-token 校验。
- Create `apps/web/app/api/tg/session/route.ts` — POST `{initData}` → 验 → 建身份 → 下发 cookie。
- Create `apps/web/app/api/tg/profile/route.ts` — GET（读当前用户档案）/ POST（起盘建档）。
- Create `apps/web/lib/tg/client.ts` — `"use client"` Mini App 引导：检测 TG、读 initData、换 cookie、`isTelegram()`。
- Modify `apps/web/app/reading/ReadingForm.tsx` — TG 环境下提交走 `/api/tg/profile`（否则现状）。
- Modify `apps/web/app/layout.tsx` — 注入 `telegram-web-app.js`（`next/script`，仅运行时生效）。
- Create `supabase/migrations/0005_tg_users.sql` —（kimi 写 SQL，claude apply）。
- Modify `apps/web/.env.example` — 记 TG 变量名（占位）。

**Pact**：feature `tg-p1`，owner=kimi，reviewer=claude。

---

## Task 1（kimi）：`verifyInitData` — Telegram initData 校验

**Files:** Create `packages/core/src/tg/initData.ts`；Test `packages/core/test/tg-initData.test.ts`；Modify `packages/core/src/index.ts`（导出）。
> 放 core（纯函数、可被 web 复用、core 已配 Vitest）。仅依赖 Node `crypto`。

**Interfaces — Produces:**
```ts
export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
export type VerifyResult = { ok: true; user: TgUser; authDate: number } | { ok: false; reason: string };
export function verifyInitData(initData: string, botToken: string, maxAgeSec?: number): VerifyResult;
```

- [ ] **Step 1: 写失败测试**（用同算法在测试内造一个合法 initData，再验；并测篡改/过期）

```ts
import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyInitData } from "../src/tg/initData";

const TOKEN = "123456:TEST_TOKEN";
function makeInitData(fields: Record<string, string>): string {
  const dataCheck = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  const p = new URLSearchParams(fields);
  p.set("hash", hash);
  return p.toString();
}

describe("verifyInitData", () => {
  const now = Math.floor(Date.parse("2026-06-29T00:00:00Z") / 1000);
  const user = JSON.stringify({ id: 42, first_name: "Joey", username: "joey" });
  it("合法 initData → ok + 解析 user", () => {
    const initData = makeInitData({ user, auth_date: String(now) });
    const r = verifyInitData(initData, TOKEN, 10 ** 9);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.user.id).toBe(42); expect(r.user.username).toBe("joey"); }
  });
  it("篡改 hash → fail", () => {
    const initData = makeInitData({ user, auth_date: String(now) }).replace(/hash=[0-9a-f]+/, "hash=deadbeef");
    expect(verifyInitData(initData, TOKEN, 10 ** 9).ok).toBe(false);
  });
  it("过期 auth_date → fail", () => {
    const initData = makeInitData({ user, auth_date: String(now - 99999) });
    expect(verifyInitData(initData, TOKEN, 3600).ok).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** — `pnpm --filter @eamvp/core test tg-initData` → FAIL（未定义）。
- [ ] **Step 3: 实现**

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string };
export type VerifyResult = { ok: true; user: TgUser; authDate: number } | { ok: false; reason: string };

/** Telegram WebApp initData 校验（官方算法）。maxAgeSec 默认 86400。 */
export function verifyInitData(initData: string, botToken: string, maxAgeSec = 86400): VerifyResult {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "missing hash" };
  params.delete("hash");
  const dataCheckString = [...params.entries()].map(([k, v]) => [k, v] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad hash" };
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || (Date.now() / 1000 - authDate) > maxAgeSec) return { ok: false, reason: "expired" };
  let user: TgUser;
  try { user = JSON.parse(params.get("user") ?? "{}"); } catch { return { ok: false, reason: "bad user json" }; }
  if (!user?.id) return { ok: false, reason: "no user id" };
  return { ok: true, user, authDate };
}
```
> 注：`timingSafeEqual` 等长前提已用 `a.length!==b.length` 守卫。`Date.now()` 在 web/Node 运行时可用（仅 workflow 脚本里被禁，本处是产品代码，无碍）。

- [ ] **Step 4: 导出 + 跑测试通过** — `packages/core/src/index.ts` 加 `export { verifyInitData } from "./tg/initData"; export type { TgUser, VerifyResult } from "./tg/initData";`；`pnpm --filter @eamvp/core test tg-initData` → PASS。
- [ ] **Step 5: 提交**（由 claude 执行）`feat(tg): verifyInitData initData 校验 [EP-tg-1]`

**验收：** 合法通过、篡改/过期拒绝；纯函数、无 env 依赖。

---

## Task 2（kimi 写 SQL / claude apply）：`tg_users` 迁移

**Files:** Create `supabase/migrations/0005_tg_users.sql`

```sql
-- EP-tg · Telegram 身份映射 + 偏好 + 免费额度
create table if not exists public.tg_users (
  tg_user_id        bigint primary key,
  supabase_user_id  uuid not null references auth.users(id) on delete cascade,
  tg_chat_id        bigint,
  username          text,
  lang              text default 'zh',
  tz                text default 'Asia/Shanghai',
  daily_push        boolean default false,
  push_hour         int default 8,
  llm_uses          int default 0,
  free_llm_quota    int default 30,
  quota_period      text default 'lifetime',
  created_at        timestamptz default now()
);
create unique index if not exists tg_users_supabase_user_idx on public.tg_users (supabase_user_id);
alter table public.tg_users enable row level security;
-- 仅本人可读自己的映射行（按签发会话的 uuid）；写入仅 service_role（默认无 policy = 拒绝，service_role 绕过）
create policy own_select on public.tg_users for select using (auth.uid() = supabase_user_id);
```

- [ ] Step 1: kimi 写上述 `.sql`。
- [ ] Step 2: claude 用 Supabase MCP `apply_migration`（name `tg_users`）。
- [ ] Step 3: claude `list_tables` + `get_advisors(security)` 验：表在、RLS 开、无新增非预期告警（匿名访问告警与 profiles 同源、可接受）。
- [ ] Step 4: 提交（claude）`feat(db): tg_users 表 + RLS [EP-tg-2]`

**验收：** 表存在、RLS 开、`supabase_user_id` 唯一。

---

## Task 3（kimi）：service-role 客户端 + 身份映射

**Files:** Create `apps/web/lib/tg/admin.ts`、`apps/web/lib/tg/identity.ts`

**Interfaces — Produces:**
```ts
// admin.ts
export function supabaseAdmin(): SupabaseClient; // service_role，禁止持久化会话
// identity.ts
export async function resolveOrCreateTgUser(tg: { id: number; username?: string; lang?: string }, chatId?: number): Promise<{ supabaseUserId: string }>;
export async function getProfileForUser(supabaseUserId: string): Promise<Profile | null>;
export async function createProfileForUser(supabaseUserId: string, input: { nickname?: string; birthInput: BirthInput; chart: UnifiedChart }): Promise<Profile>;
export type Profile = { id: string; nickname: string; birthInput: BirthInput; chart: UnifiedChart; createdAt: string; reading: string | null };
```
**Consumes:** `@eamvp/core` 的 `BirthInput`/`UnifiedChart`；`@supabase/supabase-js`。

- [ ] **Step 1: `admin.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
let _c: SupabaseClient | null = null;
export function supabaseAdmin(): SupabaseClient {
  if (_c) return _c;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service-role 未配置");
  _c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _c;
}
```

- [ ] **Step 2: `identity.ts`**：`resolveOrCreateTgUser`（查 `tg_users`；无则 `supabaseAdmin().auth.admin.createUser({ email: `tg_${id}@zhaojian.local`, email_confirm: true })` 拿 uuid → upsert `tg_users`）。`getProfileForUser`（service-role select profiles where user_id=uuid 最近一条）。`createProfileForUser`（insert profiles，user_id=uuid，nickname/birth_input/chart）。映射列名同 `lib/profiles.ts`（`birth_input`/`chart`/`reading`）。

```ts
import { supabaseAdmin } from "./admin";
import type { BirthInput, UnifiedChart } from "@eamvp/core";
export type Profile = { id: string; nickname: string; birthInput: BirthInput; chart: UnifiedChart; createdAt: string; reading: string | null };
const toProfile = (r: any): Profile => ({ id: r.id, nickname: r.nickname, birthInput: r.birth_input, chart: r.chart, createdAt: r.created_at, reading: r.reading ?? null });

export async function resolveOrCreateTgUser(tg: { id: number; username?: string; lang?: string }, chatId?: number): Promise<{ supabaseUserId: string }> {
  const sb = supabaseAdmin();
  const { data: existing } = await sb.from("tg_users").select("supabase_user_id").eq("tg_user_id", tg.id).maybeSingle();
  if (existing?.supabase_user_id) {
    if (chatId) await sb.from("tg_users").update({ tg_chat_id: chatId, username: tg.username }).eq("tg_user_id", tg.id);
    return { supabaseUserId: existing.supabase_user_id as string };
  }
  const { data: created, error } = await sb.auth.admin.createUser({ email: `tg_${tg.id}@zhaojian.local`, email_confirm: true });
  if (error || !created.user) throw new Error("createUser 失败: " + (error?.message ?? "")); 
  const uid = created.user.id;
  const { error: e2 } = await sb.from("tg_users").insert({ tg_user_id: tg.id, supabase_user_id: uid, tg_chat_id: chatId ?? null, username: tg.username ?? null, lang: tg.lang ?? "zh" });
  if (e2) throw e2;
  return { supabaseUserId: uid };
}
export async function getProfileForUser(supabaseUserId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin().from("profiles").select("*").eq("user_id", supabaseUserId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}
export async function createProfileForUser(supabaseUserId: string, input: { nickname?: string; birthInput: BirthInput; chart: UnifiedChart }): Promise<Profile> {
  const { data, error } = await supabaseAdmin().from("profiles").insert({ user_id: supabaseUserId, nickname: input.nickname?.trim() || "无名", birth_input: input.birthInput, chart: input.chart }).select("*").single();
  if (error) throw error;
  return toProfile(data);
}
```

- [ ] **Step 3: 构建校验** `pnpm --filter @eamvp/web build`（TS 通过即可；运行态在 Task 6 验）。
- [ ] **Step 4: 提交**（claude）`feat(tg): service-role 客户端 + 身份映射 [EP-tg-3]`

**验收：** TS 通过；逻辑：查→建 auth user→upsert tg_users；profiles 读/建按 user_id。

---

## Task 4（kimi）：短时会话 cookie

**Files:** Create `apps/web/lib/tg/session.ts`；Test `packages/core/test/tg-session.test.ts`（把纯签名函数放 core `packages/core/src/tg/session.ts`，web 的 cookie 读写薄封装调用它）。

**Interfaces — Produces:**
```ts
// core: packages/core/src/tg/session.ts
export function signSession(payload: { uid: string; tgId: number; exp: number }, secret: string): string;
export function verifySession(token: string, secret: string): { uid: string; tgId: number } | null;
// web: apps/web/lib/tg/session.ts
export const TG_COOKIE = "zj_tg";
export function makeSessionToken(uid: string, tgId: number): string; // 用 env secret + 1h exp
export function readSession(token: string | undefined): { uid: string; tgId: number } | null;
```

- [ ] **Step 1: 写失败测试**（core 纯函数：签发→验通过；篡改/过期→null）

```ts
import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "../src/tg/session";
const S = "test-secret";
describe("tg session", () => {
  it("round-trip", () => {
    const t = signSession({ uid: "u1", tgId: 42, exp: Math.floor(Date.now()/1000)+60 }, S);
    expect(verifySession(t, S)).toEqual({ uid: "u1", tgId: 42 });
  });
  it("过期→null", () => {
    const t = signSession({ uid: "u1", tgId: 42, exp: Math.floor(Date.now()/1000)-1 }, S);
    expect(verifySession(t, S)).toBeNull();
  });
  it("篡改→null", () => {
    const t = signSession({ uid: "u1", tgId: 42, exp: Math.floor(Date.now()/1000)+60 }, S) + "x";
    expect(verifySession(t, S)).toBeNull();
  });
});
```

- [ ] **Step 2: 跑确认失败。**
- [ ] **Step 3: 实现** core `session.ts`（`base64url(JSON).` + HMAC-SHA256 签名，`timingSafeEqual` 验，校验 exp）。web `session.ts` 用 `process.env.TELEGRAM_WEBHOOK_SECRET` 包一层 + `TG_COOKIE` 常量。导出 core 函数。
- [ ] **Step 4: 跑确认通过。**
- [ ] **Step 5: 提交**（claude）`feat(tg): 短时会话 cookie 签名 [EP-tg-4]`

**验收：** 签验 round-trip、过期/篡改拒绝。

---

## Task 5（kimi）：`/api/tg/session` 路由

**Files:** Create `apps/web/app/api/tg/session/route.ts`
**Consumes:** `verifyInitData`(core)、`resolveOrCreateTgUser`/`getProfileForUser`(identity)、`makeSessionToken`/`TG_COOKIE`(session)。

- [ ] **Step 1: 实现**

```ts
import { NextResponse } from "next/server";
import { verifyInitData } from "@eamvp/core";
import { resolveOrCreateTgUser, getProfileForUser } from "@/lib/tg/identity";
import { makeSessionToken, TG_COOKIE } from "@/lib/tg/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request): Promise<Response> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return new Response("TG 未配置", { status: 503 });
  const { initData } = await req.json().catch(() => ({} as any));
  if (typeof initData !== "string") return new Response("缺少 initData", { status: 400 });
  const v = verifyInitData(initData, token);
  if (!v.ok) return new Response("initData 校验失败: " + v.reason, { status: 401 });
  const { supabaseUserId } = await resolveOrCreateTgUser({ id: v.user.id, username: v.user.username, lang: v.user.language_code });
  const profile = await getProfileForUser(supabaseUserId);
  const res = NextResponse.json({ ok: true, hasProfile: !!profile });
  res.cookies.set(TG_COOKIE, makeSessionToken(supabaseUserId, v.user.id), {
    httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 3600,
  });
  return res;
}
```
> `sameSite:"none"` 因 Mini App 在 Telegram webview 跨上下文；`secure` 必须（生产 https）。

- [ ] **Step 2: 集成验证**（claude，dev :3030）：构造一条合法 initData（用 Task1 测试里的 `makeInitData` + 真 bot token）curl POST → 期望 `{ok:true,hasProfile:false}` + `Set-Cookie: zj_tg=...`。
- [ ] **Step 3: 提交**（claude）`feat(tg): /api/tg/session 身份换 cookie [EP-tg-5]`

**验收：** 合法 initData→200+cookie+hasProfile；非法→401。

---

## Task 6（kimi）：`/api/tg/profile` 路由（起盘建档/读取）

**Files:** Create `apps/web/app/api/tg/profile/route.ts`
**Consumes:** `readSession`/`TG_COOKIE`、`getProfileForUser`/`createProfileForUser`、`computeUnifiedChart`/`BirthInputSchema`(core)。

- [ ] **Step 1: 实现**（GET 读、POST 起盘建档）

```ts
import { cookies } from "next/headers";
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser, createProfileForUser } from "@/lib/tg/identity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function uid(): Promise<{ uid: string } | null> {
  const c = (await cookies()).get(TG_COOKIE)?.value;
  return readSession(c);
}
export async function GET(): Promise<Response> {
  const s = await uid(); if (!s) return new Response("未登录", { status: 401 });
  const p = await getProfileForUser(s.uid);
  return Response.json({ profile: p });
}
export async function POST(req: Request): Promise<Response> {
  const s = await uid(); if (!s) return new Response("未登录", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = BirthInputSchema.safeParse(body?.birthInput);
  if (!parsed.success) return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
  let chart; try { chart = computeUnifiedChart(parsed.data); } catch (e) { return new Response("排盘失败", { status: 500 }); }
  const profile = await createProfileForUser(s.uid, { nickname: body?.nickname, birthInput: parsed.data, chart });
  return Response.json({ profile });
}
```
> `cookies()` 在 Next 16 为 async，需 `await`。

- [ ] **Step 2: 集成验证**（claude）：带 Task5 拿到的 cookie，POST 一组出生信息 → 期望返回 `{profile:{id,chart,...}}`；再 GET → 同档案。Supabase 里 profiles 多一行（user_id=映射 uuid）。
- [ ] **Step 3: 提交**（claude）`feat(tg): /api/tg/profile 起盘建档/读取 [EP-tg-6]`

**验收：** 起盘建档落库（service-role）、GET 读回；未登录 401。

---

## Task 7（kimi）：grammY bot + `/api/tg/webhook`

**Files:** Create `apps/web/lib/tg/bot.ts`、`apps/web/app/api/tg/webhook/route.ts`；deps 加 `grammy`。
**Consumes:** `resolveOrCreateTgUser`/`getProfileForUser`。

- [ ] **Step 1: 装依赖** `pnpm --filter @eamvp/web add grammy`。
- [ ] **Step 2: `bot.ts`**（懒初始化 + `/start`：建身份、存 chat_id、回带 Mini App 按钮）

```ts
import { Bot, InlineKeyboard } from "grammy";
import { resolveOrCreateTgUser, getProfileForUser } from "./identity";
let _bot: Bot | null = null;
const MINIAPP_URL = process.env.NEXT_PUBLIC_MINIAPP_URL || "https://zhaojian-mvp.vercel.app";
export function getBot(): Bot {
  if (_bot) return _bot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN 未配置");
  const bot = new Bot(token);
  bot.command("start", async (ctx) => {
    const u = ctx.from!; 
    const { supabaseUserId } = await resolveOrCreateTgUser({ id: u.id, username: u.username, lang: u.language_code }, ctx.chat.id);
    const has = await getProfileForUser(supabaseUserId);
    const kb = new InlineKeyboard().webApp(has ? "🔮 打开照见" : "📿 起盘 · 打开照见", MINIAPP_URL + (has ? "/spirit" : "/reading"));
    await ctx.reply(has ? "欢迎回到照见。点开看你的命盘与本命之灵：" : "欢迎来到照见——东方命理 × 西方心理的自我观照。先起盘，看见你自己：", { reply_markup: kb });
  });
  _bot = bot; return bot;
}
```
> Mini App 按钮用 `webApp(...)`（生成 `web_app` 内联按钮，在 Telegram 内打开 webview）。

- [ ] **Step 3: `webhook/route.ts`**（secret token 校验 + grammY std/http 适配）

```ts
import { webhookCallback } from "grammy";
import { getBot } from "@/lib/tg/bot";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = webhookCallback(getBot(), "std/http");
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET)
    return new Response("forbidden", { status: 403 });
  return handle(req);
}
```

- [ ] **Step 4: 注册 webhook**（claude，一次性 curl）：`setWebhook` 指向 `https://zhaojian-mvp.vercel.app/api/tg/webhook`，带 `secret_token=$TELEGRAM_WEBHOOK_SECRET`。
- [ ] **Step 5: 真机验证**（claude/用户）：Telegram 里 `/start` → 收到欢迎 + 「起盘·打开照见」按钮。
- [ ] **Step 6: 提交**（claude）`feat(tg): grammY bot + webhook（/start 拉起 Mini App）[EP-tg-7]`

**验收：** `/start` 回欢迎 + Mini App 按钮；secret 校验生效；chat_id 落库。

---

## Task 8（kimi）：Mini App 适配（TG 引导 + 起盘闭环）

**Files:** Create `apps/web/lib/tg/client.ts`；Modify `apps/web/app/layout.tsx`、`apps/web/app/reading/ReadingForm.tsx`、`apps/web/.env.example`。

**Interfaces — Produces (`client.ts`, "use client"):**
```ts
export function isTelegram(): boolean;                 // window.Telegram?.WebApp?.initData 非空
export async function ensureTgSession(): Promise<boolean>; // 调 /api/tg/session 换 cookie；返回 hasProfile
export function tgReadyExpand(): void;                 // WebApp.ready()+expand()
```

- [ ] **Step 1: `client.ts`** — 读 `window.Telegram.WebApp.initData`，POST `/api/tg/session`（`credentials:"include"`）；`isTelegram`/`tgReadyExpand`。
- [ ] **Step 2: `layout.tsx`** — `<Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />`（`next/script`）。仅加载脚本，非 TG 环境无副作用。
- [ ] **Step 3: `ReadingForm.tsx`** — 提交时若 `isTelegram()`：先 `ensureTgSession()` → POST `/api/tg/profile`（带 birthInput）→ 成功后跳 `/chart`（TG 模式下 /chart 读档需后端中介，留 P2；P1 先验建档成功 + 跳转）。非 TG：保持现状（现有 createProfile 流程）。**仅在 isTelegram 分支改动，web 路径零变化。**
- [ ] **Step 4: `.env.example`** — 追加 `TELEGRAM_BOT_TOKEN=` / `TELEGRAM_WEBHOOK_SECRET=` / `SUPABASE_SERVICE_ROLE_KEY=` / `NEXT_PUBLIC_MINIAPP_URL=` 占位注释。
- [ ] **Step 5: 构建** `pnpm --filter @eamvp/web build` 通过。
- [ ] **Step 6: 真机验证**（claude/用户）：Telegram `/start`→按钮→Mini App 打开 /reading→填出生信息→提交→建档成功→跳 /chart。
- [ ] **Step 7: 提交**（claude）`feat(tg): Mini App 引导 + 起盘闭环 [EP-tg-8]`

**验收：** TG 内起盘建档闭环跑通；非 TG web 行为不变；build 通过。

---

## P1 合并与上线
- 全 task accepted + `pnpm --filter @eamvp/core test` & `@eamvp/web build` 全绿 → 合 main。
- 生产 env 补 `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET`/`SUPABASE_SERVICE_ROLE_KEY`/`NEXT_PUBLIC_MINIAPP_URL`（Vercel）。
- claude 注册生产 webhook（Task 7 Step 4）。
- 更新 `.agent/CURRENT.md`。

---

# P2–P4 路线（各自独立 plan，P1 完成后再展开）

**P2 原生灵对话 + /today + 配额**
- `/api/tg/spirit/chat`（读 cookie→service-role 取 chart/memory/questionnaire→`streamSpiritChat`；DM 侧 bot.on("message:text")→typing+分段 editMessageText）。
- `/api/tg/daily`（`computeDailyFortune`+配额内 `generateDailySpiritGreeting`）；bot `/today`。
- 配额：`tg_users.llm_uses`/`free_llm_quota`，LLM 动作前置检查 + 成功 `llm_uses++`（service-role 原子自增 RPC）；耗尽友好提示。
- Mini App /chart、/spirit 改后端中介读档（`/api/tg/profile` + 新增 spirit/daily 端点）。

**P3 每日推送**
- Vercel Cron（`apps/web/app/api/tg/cron/route.ts` + `vercel.json` schedule，每小时）→ 选 `daily_push=true` 且本地 `push_hour` 命中的用户 → 推送 /today。
- Telegram 限流（全局 30/s、单 chat 1/s）+ LLM 节流/缓存（同档同日问今缓存）。bot `/subscribe`/`/unsubscribe`/`/settings`。

**P4 分享裂变**
- satori/`@vercel/og` 生成命盘·运势水墨 PNG；bot 内联分享 + `start_param` 归因（`/start <ref>`）。

---

## 编排（本计划执行方式）
- 全部 task **owner=kimi**，**reviewer=claude**（pact feature `tg-p1`）。
- kimi 调用：`kimi -p "<task 指令含文件/接口/代码/验收>"`（前后端均 kimi）。
- claude 职责：apply Supabase 迁移（MCP）、跑 core 测试 + web build、集成 curl 验证、真机/webhook 注册、提交、accept、合并。
- kimi 连续 2 次产出不符 → claude 接管该 task。
