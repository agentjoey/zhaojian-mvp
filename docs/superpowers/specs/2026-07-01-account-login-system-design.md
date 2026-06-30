# 照见 · 用户账号与登录体系 — Design Spec

- **Date:** 2026-07-01
- **Status:** Draft（设计已确认，待 writing-plans）
- **代号:** `EP-account`
- **本 spec 范围:** 综合账号体系的**子项目 1（身份地基）+ 2（Web 登录）**——二者一体。子项目 3（web⇄TG 统一）由「用 Telegram 登录」天然达成、并入本 spec；**子项目 4（付费基座）与 5（账号管理 UI 完整化）留作后续独立 spec。**

## 目标与背景
让用户拥有**持久、可跨设备、可统一 web/TG** 的账号，档案不再因清缓存/换设备而丢。
- **现状**：web = Supabase **匿名登录**（`signInAnonymously`，session 存浏览器），`profiles.user_id = auth.uid()`，RLS 隔离 → 清缓存/换设备即丢。TG = `tg_users.tg_user_id → supabase_user_id`（service_role 后端中介），身份已持久。
- **取向（已定）**：**匿名优先 + 登录升级**（保持照见零摩擦；登录是「保存/同步」的升级）。Web 登录方式 = **用 Telegram 登录** + **邮箱魔法链接**（不做 Google/Apple/手机号）。

## 架构（已定：方案 A — 以 `auth.users` 为账号本体）
复用 Supabase 原生身份能力，**最少迁移**：账号 = `auth.users`，可挂多凭证（匿名 / 邮箱 / Telegram）。`profiles.user_id` 语义与 RLS **不变**；`tg_users` 复用。不引入独立 accounts 表。

### 1. 凭证模型
- **匿名**：web 进入即 `signInAnonymously()`（现状保留）。
- **邮箱**：Supabase 原生 magic link；匿名→邮箱用**原生 identity linking**（`linkIdentity`/`updateUser`，同一 `user.id`，档案天然保留）。
- **Telegram**：自定义（非 Supabase 原生 provider）——见下。

### 2. 「用 Telegram 登录」流程（web）
1. `/account` 嵌入 **Telegram Login Widget**（`telegram.org/js/telegram-widget.js`，配 bot username，回调模式）。
2. Widget 回传 `{id, first_name, username, photo_url, auth_date, hash}` → POST `/api/auth/telegram`。
3. 服务端用 **bot token 验 hash**（HMAC-SHA256，data_check_string，类比现有 `verifyInitData`；校验 `auth_date` 时效）。
4. 取 `tg_user_id = id` → 查 `tg_users`：
   - **命中** → 复用该 `supabase_user_id`（**与 TG 端同账号、共享档案**）。
   - **未命中** → service_role 建 `auth.users` + `tg_users` 行（复用现有 `resolveOrCreateTgUser`）。
5. 签发 **`zj_tg` 签名 cookie**（复用现有 `lib/tg/session` 的 `makeSessionToken`）→ web 端进入「TG 会话模式」。

### 3. 两种会话模式（绕开 ECC 密钥无法自签 Supabase 会话的限制）
照见用非对称 ECC 签名密钥，无法自签 Supabase JWT（即当初 TG 走后端中介之由）。故 web 同时支持两套会话，数据层已天然抽象（web 路径 vs TG 路径）：
- **Supabase 原生会话**（匿名 / 邮箱）：浏览器 client + RLS（现有 web 路径，magic link 全程原生，无自签问题）。
- **Telegram cookie 会话**：`zj_tg` cookie + `/api/tg/*` + service_role（复用 Mini App 整套 `lib/tg/*`）。
- **统一判定**：把现有 `isTelegram()` 泛化为 **`hasTgSession()`** = `isTelegram()`（Mini App 内）**或** 持有效 `zj_tg` cookie（web-TG 登录）。数据层（profiles/spirit/calendar/questionnaire 取存）凡现在判 `isTelegram()` 的，改判 `hasTgSession()` → web-TG 登录用户复用全部 TG 中介路径。
  - 落地：`lib/tg/client.ts` 增 `hasTgSession()`（客户端可读一个非 httpOnly 的指示位，或调用轻量 `/api/tg/session` 探测；cookie 本体 httpOnly）。详细在 plan 定。

### 4. 匿名 → 登录的「档案归并」
- **匿名 → 邮箱**（无既有账号）：原生 link，`user.id` 不变，档案保留，无需归并。
- **匿名 → Telegram**：匿名 `auth.users.id` ≠ TG `supabase_user_id` → 两个 user。登录时若当前为匿名且有本地档案：服务端 service_role 把匿名 user 的 `profiles`（及 `spirit_messages` 等关联）`user_id` **重挂**到 TG account，删除空匿名 user（或留置）。前端提示「已合并 N 个本地档案到你的账号」。
  - 归并需谨慎：仅在「匿名 + 有档案 + 目标账号」时触发；幂等；记录日志。
- **冲突**：若 TG account 已有同名档案，**不去重、全部保留**（用户后续可在档案页删）。

### 5. `/account` 页（最小）
- **未登录（匿名）态**：标题「保存你的照见」+ 说明（当前为本地匿名、登录后跨设备同步）+ 两入口：Telegram Login Widget、邮箱输入→「发送登录链接」。
- **已登录态**：显示身份（Telegram 昵称 / 邮箱）、已绑定方式、「登出」。
- 导航加「账号」入口（web；TG 内 `/account` 可显示「已通过 Telegram 登录」+ 登出回匿名）。
- 复用 TG 原生 UI 令牌（明暗自适配）。

### 6. 接口
- `POST /api/auth/telegram`：验 Login Widget hash → 解析 tg_user_id → 命中/建 → 签 `zj_tg` cookie。返回归并结果（合并档案数）。
- `POST /api/auth/logout`：清 `zj_tg` cookie（TG 会话）/ 触发 Supabase signOut（原生会话）。
- 邮箱 magic link：用 Supabase 原生 `signInWithOtp({email})` + 回调页（`/account` 或 `/auth/callback`）处理 session；**无需自建接口**。
- 归并：`/api/auth/telegram` 内部在「匿名+有档案」时调 service_role 归并（不单独暴露）。

## 测试
- core/llm 不受影响（纯前端+API+DB）。
- 单测/集成：hash 校验（有效/过期/篡改）；归并幂等（匿名有档案→TG 命中→档案重挂、再次调用不重复）；`hasTgSession()` 三态（Mini App / web-TG cookie / 纯 web）。
- 实跑：匿名建档→邮箱登录（档案留存、换浏览器同邮箱可见）；匿名建档→Telegram 登录（与 TG 端同档案、合并提示）。

## 数据 / 迁移
- `profiles` 表结构与 RLS **不变**。归并 = service_role 改 `user_id`（绕 RLS）。
- 可能新增轻量列/表缓存 display（邮箱/TG 昵称）——按需，非必须（auth.users 已有 email；TG 昵称可存 tg_users）。
- 既有 `tg_users`/`spirit_messages`/quota 全复用。

## 不在本 spec 范围（后续独立 spec）
- **子项目 4 付费基座**：订阅/权益/支付集成（与 `free_llm_quota`/`consume_llm_credit` 合流）。本 spec 仅保证账号是其载体。
- **子项目 5 账号管理完整化**：多设备会话管理、解绑、删号、数据导出等。
- Google/Apple OAuth、手机号 OTP（已排除）。

## 风险
- **Telegram Login Widget 域名校验**：Widget 需在 BotFather 绑定 domain（`zhaojian-mvp.vercel.app`）；当前 bot 是借用的 Claude-Code 网关 bot（@analyst_helen_bot）——**建议先建专属 bot**再配 domain（否则与网关冲突）。已知项，落地前与用户确认 bot。
- **两会话模式心智**：web 用户可能同时有匿名 Supabase 会话 + TG cookie；`hasTgSession()` 须明确优先级（持 `zj_tg` → TG 模式优先）。登出需同时清两者。
- **归并误并/数据丢失**：归并只重挂、不删档案数据；空匿名 user 删除前确认无残留。幂等 + 日志。
- **闪烁/竞态**：首屏判定会话模式前避免用错路径取档（统一在 `hasTgSession()` resolve 后再取数据）。

## 子项目顺序（落地）
1. 身份地基（本 spec §1-4 的数据/会话/归并底座）
2. Web 登录 UI/接口（本 spec §2,5,6）
→ 之后：4 付费基座 · 5 账号管理完整化（各自 spec）。
