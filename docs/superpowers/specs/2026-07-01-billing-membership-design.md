# 照见 · 付费基座（会员）— Design Spec

- **Date:** 2026-07-01
- **Status:** Draft（决策已定，待 review + 凭据）
- **代号:** `EP-billing`（账号体系 子项目 4）
- **依赖:** `EP-account`（账号 = auth.users；`hasTgSession`/`tg_users`/`consume_llm_credit`/`free_llm_quota` 已在）

## 决策（已定）
- **变现模型 = 免费额度 + 会员解锁**（freemium）。**确定性排盘/五维/黄历/三段式核心解读永远免费；只门 LLM 增值。**
- **付费闸功能**：① 本命之灵对话；② 每日运势 LLM 部分（心理行为宜忌/问今/润色）；③ 高级分析/时序（大限·流年四化时序、西方行运、多档案数量上限）。
- **支付渠道**：Web = **Stripe Checkout**；Telegram 内 = **Telegram Stars（XTR）**（数字商品，无需 provider token）。
- **账号载体**：会员权益挂在 `auth.users`（account），web(邮箱/匿名) 与 TG 同账号共享。

## 架构
### 1. 权益模型（DB）
新表 `public.entitlements`（或 profiles 无关，按 user）：
```
user_id uuid pk references auth.users(id) on delete cascade
tier text not null default 'free'        -- 'free' | 'member'
member_until timestamptz                 -- 会员到期（null=非会员）
updated_at timestamptz default now()
```
RLS：own_select（`auth.uid()=user_id`）；写入仅 service_role（支付回调）。
**判定 `isMember(user)` = `tier='member' AND member_until > now()`。**

### 2. 闸门逻辑（合流现有额度）
- 统一 `entitlementFor(userId)` → `{ isMember, freeRemaining }`。
- 现有 `consume_llm_credit`(TG) / `free_llm_quota`：改造为**账号级**——门控 LLM 动作时：`isMember ? 放行 : consume_llm_credit(扣免费额度，用尽→402/paywall)`。会员不消耗免费额度。
- 现 `TG_QUOTA_DISABLED=1`（临时全免）→ 上线付费时**移除该 env**，恢复额度闸；免费额度默认值（如对话 20 次/月、每日运势免费）由 spec 附录定，可 env 调。
- **门控点**（服务端）：`/api/spirit/chat`、`/api/tg/spirit`、每日运势 LLM 段（`/api/tg/daily` 的 behavior/greeting、web 对应）、高级分析/时序生成。非会员超额 → 返回结构化 `{ error:"paywall", feature }`，前端弹升级引导。
- 多档案数量上限：非会员 ≤ N（如 3），会员无限——建档前检查。

### 3. Web 支付（Stripe Checkout）
- `/api/billing/checkout`（POST，登录态）：创建 Stripe Checkout Session（mode subscription，price=会员月/年），`success_url=/account?upgraded=1`、`client_reference_id=user.id`。返回 url，前端跳转。
- `/api/billing/webhook`（Stripe webhook，验 `STRIPE_WEBHOOK_SECRET`）：`checkout.session.completed`/`customer.subscription.updated|deleted` → service_role upsert `entitlements`（tier/member_until 按订阅周期）。幂等（按 event id）。
- `/account`：非会员显示「升级会员」→ checkout；会员显示到期日 + 管理（Stripe billing portal 链接，可选后续）。

### 4. Telegram 支付（Stars/XTR）
- bot 内 `/upgrade` 命令 或 Mini App 内升级按钮 → 发 **invoice**（`sendInvoice`，currency `XTR`，prices=会员星数）。
- `pre_checkout_query` → `answerPreCheckoutQuery(ok:true)`。
- `message.successful_payment` → 解析 → service_role upsert `entitlements`（该 tg 账号的 supabase_user_id）。Stars 订阅周期用 Telegram 的 recurring 或按次充（MVP：一次性买 N 天会员，简单可靠）。
- Mini App 内 paywall → 触发 bot invoice（`WebApp.openInvoice` 或跳 bot）。

### 5. 前端 paywall
- 统一 `<Paywall feature=.../>`：非会员触达门控功能时展示（说明免费额度已用尽 + 升级入口，web→Stripe / TG→Stars）。令牌着色明暗自适配。
- `/account` 会员区块：状态/到期/升级/管理。

## 数据/迁移
- 新迁移 `0009_entitlements.sql`（表 + RLS + `isMember` 视角）。`consume_llm_credit` RPC 增会员判定或在应用层前置。
- 兼容：老 `tg_users.free_llm_quota` 保留为免费额度来源；entitlements 决定是否绕过。

## 需要用户提供的凭据（支付任务前置）
- **Stripe**：`STRIPE_SECRET_KEY`(sk_live/test)、`STRIPE_WEBHOOK_SECRET`(whsec_)、会员 `STRIPE_PRICE_ID`(月/年)、`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`。Stripe 后台建 Product+Price、配 webhook 指向 `https://zhaojian.agentjoey.ai/api/billing/webhook`。
- **Telegram Stars**：无需 provider token（XTR 数字商品由 Telegram 处理）；仅需现有 bot。价格（星数）由用户定。
- **定价**：会员月/年价（Stripe）、Stars 星数、免费额度默认值——需用户给数。

## 落地顺序（子任务，凭据无关的先做）
1. 权益模型 DB（entitlements 表 + RLS）+ `entitlementFor`/`isMember` + `/account` 会员状态展示（免费态）。
2. 闸门合流：门控 LLM 动作按 isMember/免费额度放行/paywall；移除 TG_QUOTA_DISABLED 依赖（可留 flag）；多档案上限。
3. Paywall 前端组件 + /account 升级入口占位。
—— 以下需凭据 ——
4. Stripe Checkout + webhook（web 支付 → 写 entitlements）。
5. Telegram Stars invoice + successful_payment（TG 支付 → 写 entitlements）。

## 风险
- **额度恢复**：上线付费即移除 `TG_QUOTA_DISABLED`，现有用户（含你）会重新受额度限——需同时给自己/测试号设 `tier=member` 或高额度。
- **双支付一致性**：Stripe 与 Stars 都写同一 `entitlements`；幂等 + 以 `member_until` 取较晚。
- **Stars 订阅**：Telegram Stars 周期性订阅支持有限，MVP 建议**一次性买 N 天**，到期需再买（清晰）。
- **免费额度定义**：需明确「每日运势 LLM」是否每天免费一次、对话免费次数——见附录待定。

## 附录（待用户拍板的数字）
- 会员价：月 ¥__ / 年 ¥__（Stripe）；星数 __ ⭐（Telegram，含对应天数）。
- 免费额度：本命之灵对话 __ 次（周期？）；每日运势 LLM 每天免费 __ 次；非会员档案上限 __。

## 不在范围
- 发票/税务/退款流程、Stripe Billing Portal 深度、Stars 周期订阅自动续（后续）。
