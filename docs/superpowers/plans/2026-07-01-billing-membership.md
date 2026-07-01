# 照见 · 付费基座 Implementation Plan（权益/闸门/上限/paywall，支付后续）

> 执行者 `kimi`，reviewer `claude`。kimi 只改列出文件、不 commit、密钥只读 env。**迁移由 claude 用 Supabase MCP apply**（kimi 只写 sql 文件）。spec: `docs/superpowers/specs/2026-07-01-billing-membership-design.md`。

**Goal:** 账号级会员权益 + 统一 LLM 免费额度(30/月)闸门 + 非会员档案上限(3) + paywall，全部 `BILLING_ENABLED` flag 门控（pre-prod 默认关=不限制）。Stripe/Telegram Stars 支付为后续任务（需凭据）。

**Architecture:** 权益挂 `auth.users`(entitlements 表)；`consume_llm_credit_account(user_id)` 原子月度计数(会员 bypass)；LLM 服务端端点消费额度、超额返回 `{error:"paywall"}`；前端 Paywall 引导。

**Tech Stack:** Supabase(表/RLS/RPC) · Next route handlers/server actions · 复用 `supabaseAdmin`/`hasTgSession`/`tg_users`。

## Global Constraints
- **`BILLING_ENABLED` env**：未设或 `!=="1"` → 所有闸门/上限**放行**（pre-prod 现状不变，你不受限）。`==="1"` 才强制。
- 确定性排盘/五维/黄历/三段式解读**永久免费**，只门：本命之灵对话、每日运势 LLM 段、高级时序。**统一 LLM 额度 30/月**（不分类）。会员无限、不消耗额度。非会员档案上限 3。
- 定价(env)：`MEMBER_PRICE_MONTH_USD=9`、`MEMBER_PRICE_YEAR_USD=99`、`FREE_LLM_MONTHLY=30`、`FREE_PROFILE_LIMIT=3`、Stars `STARS_MONTH=450`/`STARS_YEAR=4800`（支付任务用）。
- 账号 = auth.users；web(邮箱/匿名) 与 TG 同账号共享权益。
- 每任务 `pnpm --filter @eamvp/web build` 通过；迁移 claude apply 后验证。

## File Structure
- Create `supabase/migrations/0009_entitlements.sql` — entitlements 表 + RLS。
- Create `supabase/migrations/0010_llm_credit_account.sql` — `consume_llm_credit_account` RPC + `llm_usage` 计数。
- Create `apps/web/lib/entitlements.ts` — `getEntitlement(userId)`/`isMember(ent)`/`consumeLlm(userId)`(调 RPC，flag 感知)。
- Modify LLM 端点：`apps/web/app/api/spirit/chat/route.ts`、`apps/web/app/api/tg/spirit/route.ts`、`apps/web/app/api/tg/daily/route.ts`(LLM 段)。
- Modify 建档路径：`apps/web/lib/tg/identity.ts`(createProfileForUser)、web 建档 action（`apps/web/app/reading/actions.ts` 或 profiles 写入处）。
- Create `apps/web/components/Paywall.tsx` — paywall 组件。
- Modify `apps/web/app/account/page.tsx` — 会员状态 + 额度 + 升级占位。

**Pact** feature `billing`。

---

## Task 1（kimi）：entitlements 表 + entitlements.ts

**Files:** Create `supabase/migrations/0009_entitlements.sql`、`apps/web/lib/entitlements.ts`
- [ ] Step 1: `0009_entitlements.sql`：
```sql
create table if not exists public.entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',           -- 'free' | 'member'
  member_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;
create policy own_select on public.entitlements for select using (auth.uid() = user_id);
-- 写入仅 service_role（支付回调/管理），无 insert/update policy → 匿名/普通用户不可改
```
- [ ] Step 2: `apps/web/lib/entitlements.ts`（server-only，用 `supabaseAdmin`）：
```ts
import { supabaseAdmin } from "@/lib/tg/admin";
export type Entitlement = { tier: string; memberUntil: string | null };
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const { data } = await supabaseAdmin().from("entitlements").select("tier,member_until").eq("user_id", userId).maybeSingle();
  return { tier: data?.tier ?? "free", memberUntil: (data?.member_until as string | null) ?? null };
}
export function isMember(e: Entitlement): boolean {
  return e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now();
}
```
- [ ] Step 3: build。提交（claude apply 迁移后）`feat(billing): entitlements 表 + entitlements.ts [EP-billing-1]`

**验收：** 迁移 apply、表+RLS 存在；`getEntitlement/isMember` 可用；build 通过。

---

## Task 2（kimi）：统一 LLM 额度 RPC + 端点闸门

**Files:** Create `supabase/migrations/0010_llm_credit_account.sql`；Modify `apps/web/lib/entitlements.ts`、`apps/web/app/api/spirit/chat/route.ts`、`apps/web/app/api/tg/spirit/route.ts`、`apps/web/app/api/tg/daily/route.ts`
- [ ] Step 1: `0010_llm_credit_account.sql`：
```sql
create table if not exists public.llm_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  period  text not null,               -- 'YYYY-MM'
  uses    int not null default 0,
  primary key (user_id, period)
);
alter table public.llm_usage enable row level security;   -- 仅 service_role 访问
create or replace function public.consume_llm_credit_account(p_user_id uuid, p_free int default 30)
returns boolean language plpgsql security definer as $$
declare v_period text := to_char(now(),'YYYY-MM'); v_uses int;
begin
  insert into public.llm_usage(user_id, period, uses) values (p_user_id, v_period, 0)
    on conflict (user_id, period) do nothing;
  select uses into v_uses from public.llm_usage where user_id=p_user_id and period=v_period for update;
  if v_uses >= p_free then return false; end if;
  update public.llm_usage set uses = uses + 1 where user_id=p_user_id and period=v_period;
  return true;
end $$;
```
- [ ] Step 2: `entitlements.ts` 加：
```ts
export async function consumeLlm(userId: string): Promise<{ ok: boolean; reason?: "paywall" }> {
  if (process.env.BILLING_ENABLED !== "1") return { ok: true };            // pre-prod 放行
  const ent = await getEntitlement(userId);
  if (isMember(ent)) return { ok: true };                                   // 会员无限
  const free = Number(process.env.FREE_LLM_MONTHLY ?? 30);
  const { data } = await supabaseAdmin().rpc("consume_llm_credit_account", { p_user_id: userId, p_free: free });
  return data === true ? { ok: true } : { ok: false, reason: "paywall" };
}
```
- [ ] Step 3: 端点接入（在真正调用 LLM 前）：
  - `api/tg/spirit`、`api/tg/daily`(仅 LLM 段 behavior/greeting)：已知 tg 会话 → `supabaseUserId`(readSession)。调 `consumeLlm(supabaseUserId)`；`!ok` → 402 `{error:"paywall"}`。（daily 的确定性五维/黄历不消耗。）
  - `api/spirit/chat`(web)：需识别用户——客户端在 fetch 时带 `Authorization: Bearer <supabase access_token>`；服务端 `supabaseAdmin().auth.getUser(token)` → userId；调 `consumeLlm(userId)`；无 token/匿名也按其 user.id 计。`!ok` → 402 `{error:"paywall"}`。（对应 client 改造：`apps/web/lib/tg/client.ts` 的 web 分支/SpiritPanel web fetch 带 token。）
- [ ] Step 4: build。提交 `feat(billing): 统一 LLM 额度 RPC + 端点闸门(flag 门控) [EP-billing-2]`

**验收：** `BILLING_ENABLED=1` 时非会员超 30/月→402 paywall、会员无限、确定性内容不消耗；flag 关时全放行；build 通过。

---

## Task 3（kimi）：非会员档案上限 3

**Files:** Modify `apps/web/lib/tg/identity.ts`（createProfileForUser）、web 建档写入处（`apps/web/app/reading/actions.ts` 建 profile 的 server action）
- [ ] Step 1: 建档前检查：`if (BILLING_ENABLED==="1" && !isMember(getEntitlement(userId)))` → 查该 userId 的 profiles 数量，`>= FREE_PROFILE_LIMIT(3)` → 抛/返回 `{error:"limit"}`（前端提示升级）。TG 与 web 两路都加。
- [ ] Step 2: build。提交 `feat(billing): 非会员档案上限 3 [EP-billing-3]`

**验收：** flag 开时非会员第 4 档被挡、会员无限；flag 关放行；build 通过。

---

## Task 4（kimi）：Paywall 组件 + /account 会员状态

**Files:** Create `apps/web/components/Paywall.tsx`；Modify `apps/web/app/account/page.tsx`、触达 paywall 的前端（SpiritPanel/AskToday 处理 402）
- [ ] Step 1: `Paywall.tsx`：展示「免费额度已用尽 / 升级会员解锁无限」+ 价格($9/月·$99/年) + 升级按钮。**支付未接入**：web 按钮暂显「支付即将开放」(disabled 或 toast)；TG 内提示「Telegram 内购即将开放」。令牌着色明暗自适配。
- [ ] Step 2: `/account`：登录态加会员区块——`getEntitlement`(经一个轻 `/api/billing/status` route 返回 `{tier,memberUntil,used,free}`)；显示 会员/免费 + 本月已用 used/30 + 「升级会员」(→ Paywall)。
- [ ] Step 3: 前端 402 处理：`SpiritPanel`(发送收到 `{error:"paywall"}`) / `AskToday` → 展示 `<Paywall/>` 而非报错。（现有 TG spirit 已处理 "quota" 文案，统一为 paywall。）
- [ ] Step 4: build + claude 实测(临时 `BILLING_ENABLED=1` + 测号)。提交 `feat(billing): Paywall 组件 + /account 会员状态 [EP-billing-4]`

**验收：** /account 显示会员/额度；超额触发 Paywall；升级按钮占位（支付后续）；build 通过。

---

## 待后续（需 Stripe 凭据）
- **T5** Stripe Checkout(`/api/billing/checkout`) + webhook(`/api/billing/webhook` → upsert entitlements)。
- **T6** Telegram Stars invoice(`/upgrade` 或 Mini App) + `pre_checkout_query`/`successful_payment` → upsert entitlements。

## 上线（claude）
- T1-T4 accepted + core/llm 测 + web build 全绿 → 合 main → push 部署。迁移 apply 到 Supabase。
- **pre-prod：`BILLING_ENABLED` 不设（放行）**；实测时临时开 + 给测号设 member 验证。
- 给你的账号设 `tier=member`（SQL）以免受限。更新 CURRENT.md + memory [[feat-account-login]]。

## 编排
owner kimi / reviewer claude（pact `billing`）。波次：T1 表 → T2 额度闸 → T3 档案上限 → T4 paywall/UI。claude 每波 apply迁移(MCP)+build+实测+审+提交+accept。支付 T5/T6 待凭据。之后：账号管理(5)、i18n 各自 spec。
