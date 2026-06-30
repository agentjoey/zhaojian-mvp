# 照见 · 账号与登录体系 Implementation Plan（身份地基 + Web 登录）

> 执行者 `kimi`，reviewer `claude`。kimi 只改列出文件、不 commit、密钥只读 env。本地验证由 claude（启 dev 前 `set -a; . ./apps/web/.env.local; set +a`）。spec: `docs/superpowers/specs/2026-07-01-account-login-system-design.md`。

**Goal:** web 用户可用「邮箱魔法链接」或「用 Telegram 登录」获得持久、可跨设备、与 TG 端统一的账号；匿名优先，登录时归并本地档案。

**Architecture:** 账号 = Supabase `auth.users`（方案 A）。邮箱/匿名走 Supabase 原生会话(RLS)；Telegram 走复用 Mini App 的后端中介(`zj_tg` cookie + service_role)。`isTelegram()` 泛化为 `hasTgSession()` 统一数据路径判定。

**Tech Stack:** Next 16 client/route handlers · Supabase auth(anon/otp/admin) · Telegram Login Widget · 复用 `@eamvp/core` tg、`apps/web/lib/tg/*`。

## Global Constraints
- **不破坏现状**：匿名 web 与 Mini App 现有行为保持；改动以新增为主，`hasTgSession()` 泛化处保证 Mini App(`isTelegram()`) 仍走 TG 路径。
- `profiles` 表与 RLS **不变**；归并用 service_role 改 `user_id`。
- 复用：`verifyInitData`(参考) / `resolveOrCreateTgUser({id,username?,lang?})→{supabaseUserId}` / `TG_COOKIE="zj_tg"` / `makeSessionToken(uid,tgId)` / `readSession`。
- **Login Widget hash 算法 ≠ initData**：`secret = SHA256(botToken)`（非 `HMAC("WebAppData",botToken)`），data_check_string = 除 hash 外所有 `k=v` 按 key 升序 `\n` 连接。必须新写校验，勿复用 verifyInitData。
- 全程中文 UI。每任务 `pnpm --filter @eamvp/web build` 通过；`@eamvp/core` 改动跑 `pnpm --filter @eamvp/core test`。
- **用户前置（claude 提醒用户做）**：BotFather 对 @analyst_helen_bot 执行 `/setdomain` → `zhaojian-mvp.vercel.app`（Login Widget 必需）。

## File Structure
- Create `packages/core/src/tg/loginWidget.ts` — `verifyTelegramLogin(params, botToken, maxAgeSec)`（纯函数，可单测）。导出经 `packages/core/src/index.ts`。
- Create `apps/web/app/api/auth/telegram/route.ts` — 验 widget → resolveOrCreateTgUser → 归并(可选) → 签 `zj_tg` cookie。
- Create `apps/web/app/api/auth/logout/route.ts` — 清 `zj_tg`。
- Create `apps/web/app/api/tg/session/route.ts`（若无）— 探测当前 TG cookie 会话（供 `hasTgSession`）。
- Modify `apps/web/lib/supabase.ts` — 加 `signInWithEmail(email)`/`upgradeAnonymousToEmail(email)`/`signOutWeb()`/`getWebUser()`。
- Modify `apps/web/lib/tg/client.ts` — 加 `hasTgSession()`；`tgLoginWithWidget(data)`/`tgLogout()`。
- Create `apps/web/app/account/page.tsx` — 登录/账号页。
- Modify `apps/web/components/AppShell.tsx` — 加「账号」导航入口。
- Create `apps/web/lib/tg/merge.ts` — `mergeAnonProfiles(anonAccessToken, targetUserId)`（service_role，幂等）。
- Modify 数据层取档处（T3 枚举）：`isTelegram()` → `hasTgSession()`。

**Pact** feature `account-login`。

---

## Task 1（kimi）：邮箱魔法链接 + /account 页骨架 + 导航入口

**Files:** Modify `apps/web/lib/supabase.ts`、`apps/web/components/AppShell.tsx`；Create `apps/web/app/account/page.tsx`、`apps/web/app/auth/callback/page.tsx`

**Produces (supabase.ts):**
```ts
export async function getWebUser(): Promise<{ id:string; email:string|null; isAnonymous:boolean } | null>;
export async function upgradeAnonymousToEmail(email: string): Promise<{ ok:true } | { ok:false; error:string }>; // 匿名→邮箱：updateUser({email}) 发确认链接
export async function signInWithEmail(email: string): Promise<{ ok:true } | { ok:false; error:string }>;        // 非匿名/无会话：signInWithOtp({email})
export async function signOutWeb(): Promise<void>;
```
- [ ] Step 1: supabase.ts 实现。`getWebUser`: `const {data}=await sb.auth.getUser(); ` 返回 `{id, email, isAnonymous: !!data.user?.is_anonymous}`（无 user 返回 null）。`upgradeAnonymousToEmail`: `sb.auth.updateUser({email})`（匿名升级，Supabase 发确认到新邮箱，确认后邮箱挂同一 user.id）。`signInWithEmail`: `sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: location.origin + "/auth/callback" }})`。`signOutWeb`: `sb.auth.signOut()`。统一 try/catch 返回结构化错误。emailRedirectTo 同样加到 upgrade（updateUser 的 emailRedirectTo 经 options）。
- [ ] Step 2: `/account/page.tsx`("use client")：`getWebUser()` 取态。
  - 匿名/未登录：标题「保存你的照见」+ 说明（当前本地匿名、登录后跨设备同步）+ 邮箱 input + 「发送登录链接」按钮（匿名时调 `upgradeAnonymousToEmail`，否则 `signInWithEmail`）；发送后显示「已发送，请查收邮件」。（Telegram 入口 T2 加。）
  - 已登录(email 非匿名)：显示邮箱 + 「登出」(signOutWeb→刷新)。
  - 令牌着色（明暗自适配）。
- [ ] Step 3: `/auth/callback/page.tsx`：Supabase 回调落地页——`useEffect` 等待 `sb.auth.getSession()`(detectSessionInUrl 默认开会自动处理 hash)，成功后 `router.replace("/account")`；显示「登录中…」。
- [ ] Step 4: AppShell 导航加「账号」入口（char「账」或人形，href `/account`）；与现有 NAV 一致风格；TG 内（已隐藏 web 导航）此入口随导航一起隐藏（/account 仍可直达）。
- [ ] Step 5: build；claude 实测：匿名建档→/account 输邮箱→收 magic link→点开→/auth/callback→已登录、邮箱显示；换浏览器同邮箱登录可见同档案（同 user.id）。提交 `feat(account): 邮箱魔法链接 + /account 骨架 + 导航 [EP-account-1]`

**验收：** 邮箱登录/匿名升级全程原生会话；档案随 user.id 保留跨设备；非 TG 现状不破；build 通过。

---

## Task 2（kimi）：verifyTelegramLogin(core) + /api/auth/telegram + Login Widget

**Files:** Create `packages/core/src/tg/loginWidget.ts`、`apps/web/app/api/auth/telegram/route.ts`、`apps/web/app/api/auth/logout/route.ts`；Modify `packages/core/src/index.ts`、`apps/web/lib/tg/client.ts`、`apps/web/app/account/page.tsx`

**Produces (core):**
```ts
export type TgLoginParams = { id:number; auth_date:number; hash:string; username?:string; first_name?:string; photo_url?:string; [k:string]:unknown };
export function verifyTelegramLogin(p: TgLoginParams, botToken: string, maxAgeSec?: number): { ok:true; id:number; username?:string } | { ok:false; error:string };
```
- [ ] Step 1: `loginWidget.ts`：`secret = createHmac` 不对——用 `crypto.createHash("sha256").update(botToken).digest()`；`dataCheckString` = 取 p 除 `hash` 外所有键，`` `${k}=${v}` `` 按 key 升序、`\n` 连接；`computed = createHmac("sha256", secret).update(dataCheckString).digest("hex")`；`timingSafeEqual` 比对；校验 `auth_date` 在 maxAgeSec(默认 86400) 内。返回结构化结果。
- [ ] Step 2: 单测 `packages/core/src/tg/__tests__/loginWidget.test.ts`：用已知 botToken 构造有效签名(测试内自算 hash)验证 ok；篡改字段→fail；过期 auth_date→fail。`pnpm --filter @eamvp/core test` 通过。导出经 index.ts。
- [ ] Step 3: `/api/auth/telegram/route.ts`(nodejs runtime)：POST body = widget params。`verifyTelegramLogin(params, process.env.TELEGRAM_BOT_TOKEN!)` → 失败 401。成功 → `resolveOrCreateTgUser({id, username, lang})` → `supabaseUserId`。签 `makeSessionToken(supabaseUserId, id)` 写 `zj_tg` cookie(httpOnly, secure, sameSite lax, path /, maxAge ~30d)。**同时**写一个非 httpOnly 提示位 cookie `zj_tg_hint=1`（供客户端 `hasTgSession` 快速判定）。返回 `{ ok:true }`（归并在 T4 接）。
- [ ] Step 4: `/api/auth/logout/route.ts`：清 `zj_tg` + `zj_tg_hint`（set maxAge 0），返回 ok。
- [ ] Step 5: `client.ts`：`tgLoginWithWidget(data)` POST /api/auth/telegram；`tgLogout()` POST /api/auth/logout。
- [ ] Step 6: `/account/page.tsx`：未登录态加 Telegram Login Widget。用 Next `<Script>` 注入 `https://telegram.org/js/telegram-widget.js?22`，`data-telegram-login="<bot username>"`(=analyst_helen_bot)、`data-onauth="onTelegramAuth(user)"`、`data-request-access` 可选；定义 `window.onTelegramAuth = (u)=>tgLoginWithWidget(u).then(()=>location.reload())`。（bot username 用常量，注释提醒换专属 bot 时改 + BotFather setdomain。）
- [ ] Step 7: build + core test；claude 实测：/account 点 Telegram 登录 → 验证 → 种 cookie。提交 `feat(account): Telegram 登录(verifyTelegramLogin+API+Widget) [EP-account-2]`

**验收：** Telegram Login Widget 验签正确(单测覆盖)、命中 tg_users 复用同账号、种 zj_tg cookie；build+core test 通过。

---

## Task 3（kimi）：hasTgSession() 泛化数据路径

**Files:** Create `apps/web/app/api/tg/session/route.ts`(若无)；Modify `apps/web/lib/tg/client.ts` 及数据取档调用处（先 `grep -rn "isTelegram()" apps/web` 枚举）

**Produces:** `export function hasTgSession(): boolean`（client）= `isTelegram() || document.cookie.includes("zj_tg_hint=1")`。
- [ ] Step 1: `client.ts` 加 `hasTgSession()`（SSR 安全：`typeof document==="undefined"?false:...`）。`/api/tg/session` route：读 `zj_tg` cookie + `readSession` → 返回 `{ active:boolean }`（备用/校验）。
- [ ] Step 2: 数据取档调用处把 `isTelegram()` → `hasTgSession()`：`apps/web/app/chart/page.tsx`、`apps/web/app/calendar/page.tsx`、`apps/web/app/spirit/page.tsx`、`apps/web/app/profiles/page.tsx`、`apps/web/app/chart/SpiritPanel.tsx`、`apps/web/lib/tg/client.ts` 内部 tg* 取数封装、`apps/web/app/reading/ReadingForm.tsx`(建档落库分支)。**注意区分**：纯 UI/chrome 判定（MainButton/BackButton/隐藏导航/expand）仍用 `isTelegram()`（那是「在 Telegram 客户端内」）；**数据路径**判定（走 service_role 中介 vs Supabase RLS）改 `hasTgSession()`。逐处人工判断，prompt 里列出每文件的预期。
- [ ] Step 3: build；claude 实测：web 浏览器 Telegram 登录(有 zj_tg_hint) → /chart /spirit /calendar /profiles 走 TG 路径、能见 TG 账号档案；纯匿名 web 仍走 Supabase；Mini App 不变。提交 `feat(account): hasTgSession 泛化数据路径(web-TG登录复用中介) [EP-account-3]`

**验收：** web-TG 登录用户各页走 TG 中介见同账号档案；匿名 web/Mini App 行为不变；build 通过。

---

## Task 4（kimi）：匿名 → Telegram 登录的档案归并

**Files:** Create `apps/web/lib/tg/merge.ts`；Modify `apps/web/app/api/auth/telegram/route.ts`、`apps/web/lib/tg/client.ts`、`apps/web/app/account/page.tsx`

**Produces:** `mergeAnonProfiles(anonAccessToken: string, targetUserId: string): Promise<{ merged: number }>`（service_role，幂等）。
- [ ] Step 1: `merge.ts`：用 `supabaseAdmin().auth.getUser(anonAccessToken)` 验证匿名 token → 得 `anonId`。若 `anonId === targetUserId` 或非匿名(`is_anonymous` 假) → 返回 `{merged:0}`（不动）。否则 service_role：`update profiles set user_id=targetUserId where user_id=anonId`（统计行数）；关联表若以 user_id 关联同样重挂（`spirit_messages` 经 profile 关联，profile 迁移即随之；如有独立 user_id 列也更新）。返回 merged 数。幂等：再次调用 anonId 已无 profiles → 0。
- [ ] Step 2: `/api/auth/telegram/route.ts`：body 增可选 `anonAccessToken`。验 widget 成功、得 targetUserId 后，若传了 anonAccessToken → `mergeAnonProfiles(anonAccessToken, targetUserId)`，把 `merged` 放进响应。
- [ ] Step 3: `client.ts` `tgLoginWithWidget(data)`：调用前取当前匿名会话 token（`supabase().auth.getSession()` → `access_token`，仅当 `is_anonymous`）一并 POST。
- [ ] Step 4: `/account/page.tsx`：登录成功若 `merged>0` → toast/文案「已合并 N 个本地档案到你的账号」。
- [ ] Step 5: build；claude 实测：匿名建 2 档 → Telegram 登录 → 档案重挂到 TG 账号、提示合并 2；再登录一次 merged=0(幂等)。提交 `feat(account): 匿名→Telegram 档案归并(幂等) [EP-account-4]`

**验收：** 匿名档案登录后并入 TG 账号、提示数正确、幂等；非匿名/同账号不误并；build 通过。

---

## Task 5（kimi）：/account 已登录态完善 + 双模式登出

**Files:** Modify `apps/web/app/account/page.tsx`、`apps/web/lib/tg/client.ts`(若需)
- [ ] Step 1: `/account` 已登录态统一呈现：判定优先级——持 `zj_tg_hint` → 「已通过 Telegram 登录」(显示 username) + 登出走 `tgLogout()`；否则 Supabase user → 邮箱 + 登出走 `signOutWeb()`。登出后回匿名态（web 重新 `ensureSession()` 匿名）。
- [ ] Step 2: 登出**双清**：若两种会话痕迹都在(罕见)，登出同时 `tgLogout()` + `signOutWeb()`。
- [ ] Step 3: 文案/明暗适配收尾；Mini App 内 /account 显示「已通过 Telegram 登录」+ 登出（登出后 Mini App 仍是 TG 环境，提示重进）。
- [ ] Step 4: build；claude 实测三态(匿名/邮箱/Telegram)的 /account 显示与登出。提交 `feat(account): /account 已登录态完善+双模式登出 [EP-account-5]`

**验收：** 三态显示正确、登出回匿名、双模式不串；build 通过。

---

## 上线（claude）
全 task accepted + core/llm 测 + web build(双 flag) 全绿 → 合 main → push 部署。**前置**：提醒用户在 BotFather 对 @analyst_helen_bot `/setdomain zhaojian-mvp.vercel.app`，否则 Login Widget 不工作。真机/真浏览器回归：邮箱登录跨设备、Telegram 登录统一+归并、登出。更新 CURRENT.md + memory [[deployment-infra]]/[[feat-telegram-frontend]]。

## 编排
owner kimi / reviewer claude（pact `account-login`）。波次：T1 邮箱+骨架 → T2 Telegram 登录 → T3 hasTgSession 泛化 → T4 归并 → T5 登录态完善。claude 每波 build+实测+审+提交+accept；末尾合并部署。后续：付费基座(子项目4)、账号管理完整化(子项目5) 各自 spec。
