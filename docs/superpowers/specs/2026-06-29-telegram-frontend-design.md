# 照见 · Telegram 前端（Bot + Mini App）— Design Spec

- **Date:** 2026-06-29
- **Status:** Draft（设计已确认，待 writing-plans 拆实施计划）
- **代号前缀:** `EP-tg-*`
- **目标:** 为「照见」做 Telegram 用户前端，作为面向海外（华裔+西方探索者）的主要获客与留存渠道，复用既有排盘/解读/本命之灵引擎。
- **与现有 web 的关系:** 不改动现有 web（仍冻结）；Telegram 前端为新增渠道，复用同一 Supabase 与引擎包。

---

## 1. 形态与架构（方案 A：混合，bot 寄宿 web 应用）

**混合 = Bot + Mini App**：
- **Bot**（DM 对话）：入口、本命之灵原生对话、每日运势/问今推送、分享。
- **Mini App**（Telegram webview）：复用现有 Next 应用，承载起盘表单、命盘可视化（紫微/西方/八字）、自我画像、详细解读。

**架构关键利好（已核实）**：`@eamvp/core`（iztro/lunar/circular-natal-horoscope + zod，无 Next/React）与 `@eamvp/llm`（仅依赖 core，纯 fetch）**完全可被 bot 后端直接复用**——排盘、解读、本命之灵全部逻辑零移植。

**落点（方案 A）**：
- Webhook = `apps/web` 内一个 Next Route Handler（grammY `webhookCallback`），复用现有部署/env/`transpilePackages`。
- Mini App = 同一个 Next 应用（加 Telegram 适配层）。
- 每日推送 = Vercel Cron → 内部端点。
- 取舍：bot 与 web 同部署（耦合，v1 可接受；后续可抽 `apps/bot`）。

---

## 2. 身份鉴权

**Mini App（webview，浏览器侧）**
- Telegram 注入 `window.Telegram.WebApp.initData`（签名串）。
- 服务端路由 `POST /api/tg/session`：用 `TELEGRAM_BOT_TOKEN` 按官方算法做 **HMAC-SHA256 校验**（`secret = HMAC_SHA256("WebAppData", bot_token)`，比对 `hash`，并校验 `auth_date` 时效）。
- 校验通过 → 解析 `tg_user_id` → 解析/创建对应 Supabase auth user（确定性映射，见数据模型）→ 用 `SUPABASE_JWT_SECRET`（HS256）**签发 Supabase 会话 JWT**（`sub=supabase_user_id`, `role=authenticated`, 设 `exp`）。
- Mini App 用该会话注入 supabase client → **现有 `lib/profiles.ts` / RLS 代码零改复用**。

**Bot（DM，服务端，无 webview）**
- Telegram webhook 更新自带 `from.id`/`chat.id`，可信（Telegram→我方服务端）；额外校验请求头 `X-Telegram-Bot-Api-Secret-Token == TELEGRAM_WEBHOOK_SECRET`（防伪造直打）。
- Bot 后端用 `SUPABASE_JWT_SECRET` 签发 `role=service_role` 的 JWT（或用 service-role key）→ 按 `tg_user_id` 解析 profile 读写（绕 RLS，服务端可信）。

**打通**：Mini App 与 Bot 均按同一 `tg_user_id` 落到**同一 Supabase user → 同一 profile**。DM 建档在 Mini App 可见，反之亦然。

---

## 3. 数据模型（Supabase 增量，纯增、不破坏现有）

**新表 `tg_users`**（Telegram 身份 ↔ Supabase user + 偏好 + 用量）：
```
tg_user_id        bigint primary key
supabase_user_id  uuid not null references auth.users(id)
tg_chat_id        bigint            -- 推送用
username          text
lang              text default 'zh'
tz                text default 'Asia/Shanghai'
daily_push        boolean default false   -- 订阅制，默认关
push_hour         int default 8           -- 本地时区推送时刻
llm_uses          int default 0           -- 已用的 LLM 计费动作数（见 §4）
free_llm_quota    int default 30          -- 免费额度（可配）
quota_period      text default 'lifetime' -- 'lifetime' | 'monthly'（v1 lifetime）
created_at        timestamptz default now()
```
- `profiles` / `spirit_messages` / `profiles.spirit_memory` / `profiles.questionnaire` **全部按 `user_id` 复用，零改**。
- Supabase user 映射：首次 `initData`/首条 DM 时，按 `tg_user_id` 用 Admin（service-role）`createUser`（确定性邮箱如 `tg_<id>@zhaojian.local`）或查既有，写入 `tg_users`。
- webhook 幂等：记录已处理 `update_id`（轻表或内存+短缓存），防重复。
- `tg_users` 启用 RLS：仅 service-role 写；用户自身行可按签发会话的 uuid 读（`supabase_user_id = auth.uid()`）。

---

## 4. 免费额度与后续收费（成本闸）

**原则**：**确定性计算永远免费**（排盘、命盘可视化、五维评分、黄历、自我画像派生）——零 LLM 成本。**仅 LLM 动作计入免费额度**：完整三段式解读、本命之灵对话（按轮）、每日问今的 LLM 润色。

**v1 额度模型**：
- 每个 `tg_user` 给 `free_llm_quota`（默认 30）次 **用户主动发起的 LLM 动作**；耗尽后 LLM 动作返回友好提示「免费额度已用完，订阅即将开放」（计费本身 v1 不实现，但数据模型与计数已就位）。
- **每日推送的问今** 走独立闸：仅对 `daily_push=true` 的订阅者发送，且为控成本可（a）只发确定性五维 + 轻问候模板、（b）问今 LLM 行按全局节流/缓存（见风险）。推送默认关，避免 N×LLM 成本失控。
- 计数：每次 LLM 动作成功后 `llm_uses += 1`（service-role 原子自增）；`generateReading`/`streamSpiritChat`/`generateDailySpiritGreeting` 调用前检查 `llm_uses < free_llm_quota`。
- 演进：后续接 Telegram Payments / Stars 或外部订阅 → 把 `free_llm_quota` 升级为按周期信用或订阅态；接口已围绕「LLM 动作前置配额检查 + 用后计数」收敛，改动局部。

---

## 5. Bot 命令 / 流程

grammY，webhook 路由 `POST /api/tg/webhook`（校验 secret token）。
- `/start [start_param]` → 欢迎 + 内联按钮「📿 起盘 · 打开照见」拉起 Mini App（**起盘走 Mini App**：地名 geocode + 时辰选择，表单体验远优于聊天）。已建档用户直接给「今日运势 / 与本命之灵对话 / 看命盘」按钮。
- **DM 自由消息** → 若已建档：配额检查 → `streamSpiritChat`（本命之灵原生对话）。Telegram 无 token 级流式 → `sendChatAction("typing")` + 完成后发送，或分段 `editMessageText` 模拟书写感。若未建档：引导起盘。
- `/today` → `computeDailyFortune`（确定性五维，免费）+（配额允许时）`generateDailySpiritGreeting`（问今）→ 消息（+可选水墨图卡，P4）。
- 内联按钮「命盘 / 自我画像」→ 一键开 Mini App 对应页（`start_param` 直达 `/chart`、`/spirit`）。
- `/subscribe` `/unsubscribe` → 切 `daily_push`；`/settings` → 推送时刻/时区。
- 错误：LLM 未配置/超时/限流/配额耗尽 → 友好中文提示，不泄露栈。

---

## 6. Mini App 适配（复用现有 Next）

- 引入 `telegram-web-app.js`：`ready()`/`expand()`；读 `initData` 与主题参数；`start_param` 直达指定页；可用 Telegram `BackButton`/`MainButton`。
- 启动流程：调 `/api/tg/session` 换 Supabase 会话 → 注入 supabase client。`lib/supabase.ts` 在 Telegram 环境（检测 `window.Telegram?.WebApp?.initData`）用注入会话替代匿名登录；非 Telegram 环境保持现状。其余流程（起盘/命盘/灵/日历/画像）原样跑。
- 运行态识别：`NEXT_PUBLIC_TG_BOT_USERNAME` 用于 `t.me` 链接；Mini App 检测 `Telegram.WebApp` 决定是否走 TG 鉴权分支与隐藏 web 导航。
- 语言：全程中文，与 app 一致（见近期中文化修复）。

---

## 7. 分期

- **P1 骨架 + 身份 + 起盘闭环**：BotFather bot（token 已就位）；grammY webhook + secret 校验；`/start` + 拉起 Mini App；`/api/tg/session` initData→Supabase 会话；`tg_users` 表 + 映射；Mini App 内完成起盘建档（复用现有）。
- **P2 原生灵对话 + /today + 配额**：DM→`streamSpiritChat`（typing/分段编辑）；`/today` 运势+问今；§4 配额前置检查 + 计数。
- **P3 每日推送**：`tg_chat_id` + 偏好；Vercel Cron 按 `tz`/`push_hour` 触发；Telegram（30 msg/s 全局、1/s 每 chat）与 LLM 限流；`/subscribe`/`/unsubscribe`。
- **P4 分享裂变**：satori / `@vercel/og` 生成命盘·运势水墨卡片（PNG）+ 分享按钮 + `start_param` 归因。

---

## 8. 关键风险与对策

- **LLM 限流/成本**（MiniMax RPM~200）：确定性部分不耗 LLM；用户 LLM 动作受 §4 免费额度闸；每日推送默认关 + 订阅制 + 全局节流/缓存（同档同日问今缓存）。后续接计费。
- **Telegram 无原生 token 流式**：`typing` action + 分段 `editMessageText` 模拟书写感。
- **initData 伪造**：服务端 HMAC 强校验 + `auth_date` 时效；webhook secret token 校验。
- **MVP 冻结**：Telegram 为新增渠道，独立路由 `/api/tg/*` 与 Mini App 适配层，不动现有 web 冻结面。
- **密钥管理**：`TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` / `SUPABASE_JWT_SECRET` 仅存 env（本地 `apps/web/.env.local` 已存，gitignored；生产存 Vercel env），**不入库**。`SUPABASE_JWT_SECRET` 必须等于 Supabase 项目 JWT Secret（控制台 Settings→API），否则签发的会话/JWT 不被接受——实施首步需实跑验证一次签发+RLS 读。
- **Supabase user 暴增**：每 tg 用户一个 auth user；确定性映射、幂等创建，避免重复。

---

## 9. 环境变量（仅名称；值在 env / 不入库）

| 变量 | 用途 | 状态 |
|------|------|------|
| `TELEGRAM_BOT_TOKEN` | BotFather bot token；initData 校验 + bot API | 已存 .env.local |
| `TELEGRAM_WEBHOOK_SECRET` | webhook `X-Telegram-Bot-Api-Secret-Token` 校验 | 已生成存 .env.local |
| `SUPABASE_JWT_SECRET` | 签发 Mini App 会话 JWT + service_role JWT | 已存 .env.local（需验=项目 JWT Secret） |
| `NEXT_PUBLIC_TG_BOT_USERNAME` | t.me 链接 / Mini App 归因 | 待设 |
| `LLM_API_KEY` / `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 现有 | 已存 |

实施时上述需同步到 Vercel 生产 env。
