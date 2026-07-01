# 照见 · 账号管理完整化 — Design Spec

- **Date:** 2026-07-01
- **Status:** Draft（范围已定，待 review）
- **代号:** `EP-account-mgmt`（账号体系 子项目 5）
- **依赖:** `EP-account`（auth.users 账号、两会话模式 hasTgSession、tg_users、merge）

## 范围（已定）
① 已绑定方式展示 + 补绑；② 档案重命名/删除；③ 注销账号。**不做数据导出。**

## 1. 已绑定方式展示 + 补绑
### 展示
`/account` 已登录态列出该账号已绑定的登录方式：
- **邮箱**：`auth.users.email` 且非合成邮箱（非 `tg_*@zhaojian.local`）。
- **Telegram**：该账号 user_id 命中 `tg_users`（有 tg_user_id）。
- 经 `/api/account/identities`（服务端：Telegram 会话 readSession→uid / web Bearer→getUser→uid → 查 email + tg_users）返回 `{ email:string|null, telegram:{ username?:string }|null }`。

### 补绑（把「当前账号」再挂一种登录方式）
- **当前 web/邮箱账号 → 补绑 Telegram**：`/account` 显示 Login Widget（复用）；回调 POST `/api/account/link-telegram`（带当前 Supabase access token）：
  - 服务端验 widget hash → `tg_id`；`getUser(token)` → `currentUserId`。
  - `tg_users` 查 `tg_id`：**无** → insert `(tg_id → currentUserId)`（此账号从此可用 Telegram 登录）；**已指向 currentUserId** → 幂等 ok；**指向别的账号** → 返回 `{error:"conflict"}`（另一账号已用该 Telegram；提示用户改用「登录并合并」而非补绑，避免误并）。
- **当前 Telegram 会话账号 → 补绑邮箱**：`/account`（TG 会话）输邮箱 → POST `/api/account/link-email`（带 zj_tg cookie）：
  - 服务端 readSession→uid；service_role `admin.updateUserById(uid, { email })`（把真实邮箱写到该账号，替换合成邮箱）→ `admin.generateLink({ type:"magiclink", email })` 或触发确认邮件；用户点链接确认后邮箱可登录同账号。
  - 校验邮箱未被别的账号占用（占用→ `{error:"email_taken"}`）。

## 2. 档案重命名 / 删除
- **删除**：已有 `deleteProfileForUser`(TG service_role) 与 web `deleteProfile`；`/profiles` 页补齐删除按钮/二次确认（明暗适配）。
- **重命名**：`profiles` 表当前**无 update policy（档案冻结）**。仅放开 **nickname** 更新：
  - 迁移 `0011`：`create policy own_update_nickname on profiles for update using (auth.uid()=user_id) with check (auth.uid()=user_id);`——但为防改动命盘字段，**改走服务端**更稳：web 经一个 server action / TG 经 service_role 只更新 `nickname` 列（不碰 chart/birth_input）。**采用服务端方案，不加宽 RLS。**
  - `/profiles` 每档案「重命名」→ 输入 → 更新 nickname（TG: `/api/tg/profile` PATCH 或新 `/api/account/rename`；web: server action 只 set nickname）。命盘数据仍冻结。

## 3. 注销账号
- `/account` 危险区「注销账号」→ 二次确认（输入确认词/勾选）→ POST `/api/account/delete`：
  - 服务端识别 uid（TG 会话 / web Bearer）。**service_role**：`admin.deleteUser(uid)` → `on delete cascade` 连带删除 `profiles`/`spirit_messages`/`entitlements`/`tg_users`/`llm_usage`。
  - 清会话：清 `zj_tg`+`zj_tg_hint`（TG）、前端 `signOutWeb()`（web）→ 回到全新匿名。
  - 幂等/日志；不可逆，UI 强提示。

## 接口
- `GET /api/account/identities` → `{email, telegram}`。
- `POST /api/account/link-telegram`（widget data + anon/current token）→ `{ok}|{error:"conflict"}`。
- `POST /api/account/link-email`（email，TG 会话）→ `{ok}|{error:"email_taken"}`。
- `POST /api/account/rename`（profileId, nickname）→ `{ok}`（服务端只改 nickname，校验归属）。
- `POST /api/account/delete` → `{ok}`（service_role deleteUser + 清会话）。

## 数据/迁移
- 无新表。重命名走服务端只更 nickname（不加宽 RLS）。删除依赖既有 `on delete cascade`（确认各表 FK 均 cascade：profiles/spirit_messages/entitlements/llm_usage/tg_users → 是）。

## 测试
- identities 三态（纯邮箱/纯 TG/两者）。
- link-telegram：free/同账号(幂等)/conflict 三分支。
- link-email：正常/被占用。
- rename：只改 nickname、命盘不变、非归属拒绝。
- delete：级联删净、会话清空、幂等。

## 风险
- **补绑 conflict**：TG 已属别账号时**不自动合并**（避免误并数据），提示走「登录并合并」路径（EP-account 的归并）。
- **link-email 确认前**：邮箱写入但未确认期间，避免误判已绑定——以确认后为准（或标记 pending）。
- **注销不可逆**：强二次确认；service_role 删除绕 RLS，务必核对 uid 归属。
- **两会话识别**：所有接口统一「TG 会话优先(zj_tg) 否则 web Bearer」解析 uid。

## 不在范围
- 数据导出、多设备会话列表/远程登出、解绑（只加不减登录方式；注销是整账号删除）。
