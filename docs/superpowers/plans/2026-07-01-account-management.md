# 照见 · 账号管理完整化 Implementation Plan

> 执行者 `kimi`，reviewer `claude`。kimi 只改列出文件、不 commit。spec: `docs/superpowers/specs/2026-07-01-account-management-design.md`。统一 uid 解析：TG 会话优先(`readSession`(zj_tg)) 否则 web `Authorization: Bearer <supabase token>`→`supabaseAdmin().auth.getUser`。

**Goal:** /account 展示已绑定登录方式 + 补绑(web↔Telegram/email)、档案重命名/删除、注销账号(级联删)。

**Tech Stack:** Next route handlers · Supabase admin(service_role) · 复用 verifyTelegramLogin/resolveOrCreateTgUser/readSession/entitlements。

## Global Constraints
- 所有接口 nodejs runtime；uid 解析统一 helper（新 `apps/web/lib/account/uid.ts` `resolveUid(req)`）。
- 补绑 conflict 不自动合并（提示走登录合并）。注销不可逆、强二次确认、service_role 核对归属。
- 命盘冻结不变：重命名只改 `nickname` 列（服务端），不加宽 profiles RLS。
- 每任务 `pnpm --filter @eamvp/web build` 通过。

## File Structure
- Create `apps/web/lib/account/uid.ts` — `resolveUid(req): Promise<{uid:string, via:"tg"|"web"}|null>`。
- Create `apps/web/app/api/account/identities/route.ts`、`link-telegram/route.ts`、`link-email/route.ts`、`rename/route.ts`、`delete/route.ts`。
- Modify `apps/web/app/account/page.tsx`（绑定展示+补绑+注销危险区）、`apps/web/app/profiles/page.tsx`（重命名/删除）。

**Pact** feature `account-mgmt`。

---

## Task 1（kimi）：uid helper + identities API + /account 绑定展示 + 补绑 Telegram

**Files:** Create `apps/web/lib/account/uid.ts`、`apps/web/app/api/account/identities/route.ts`、`apps/web/app/api/account/link-telegram/route.ts`；Modify `apps/web/app/account/page.tsx`
- [ ] Step 1: `uid.ts` `resolveUid(req)`: 先 `readSession((await cookies()).get(TG_COOKIE)?.value)` → 有则 `{uid:s.uid, via:"tg"}`；否则读 `Authorization: Bearer` → `supabaseAdmin().auth.getUser(token)` → `{uid:user.id, via:"web"}`；都无 → null。
- [ ] Step 2: `identities/route.ts` GET: `resolveUid` → 用 admin 查 `auth.users.email`（`admin.auth.admin.getUserById(uid)`）+ `tg_users`(eq supabase_user_id=uid) → 返回 `{ email: (real email, 非 tg_*@zhaojian.local ? email : null), telegram: row?{username:row.username}:null }`。
- [ ] Step 3: `link-telegram/route.ts` POST(widget params + 当前 token): `verifyTelegramLogin`→tg_id；`resolveUid`(web token)→currentUid；查 tg_users(tg_id)：无→insert(tg_user_id=tg_id, supabase_user_id=currentUid, username)；指向 currentUid→ok；指向别的→`{error:"conflict"}` 409。
- [ ] Step 4: `/account`: 已登录态加「已绑定」区：fetch identities 显示 邮箱/Telegram（未绑的给「绑定」入口）。web/邮箱账号显示 Telegram Login Widget（`data-onauth` 调 link-telegram 而非登录）；conflict→提示。
- [ ] Step 5: build。提交 `feat(account-mgmt): uid helper+identities+补绑Telegram [EP-am-1]`

**验收：** identities 三态正确；web 账号补绑 Telegram（free/幂等/conflict）；build 通过。

---

## Task 2（kimi）：补绑邮箱（TG 会话账号 → 加邮箱）

**Files:** Create `apps/web/app/api/account/link-email/route.ts`；Modify `apps/web/app/account/page.tsx`
- [ ] Step 1: `link-email/route.ts` POST({email}, 需 TG 会话): `resolveUid`(via 应为 tg)；校验 email 未被占用（`admin.auth.admin.listUsers` 或查询；被占→`{error:"email_taken"}` 409）；`admin.auth.admin.updateUserById(uid,{email})`；发确认：`admin.auth.admin.generateLink({type:"email_change_current"|"magiclink", email})` — 用 `generateLink({type:'magiclink', email})` 返回的 action_link 由 Supabase 邮件发送（或 signInWithOtp 触发）。返回 `{ok, pending:true}`。
- [ ] Step 2: `/account`(TG 会话态): 「绑定邮箱」输入 → 调 link-email → 提示「确认邮件已发送」。
- [ ] Step 3: build。提交 `feat(account-mgmt): 补绑邮箱(TG账号加email) [EP-am-2]`

**验收：** TG 账号加邮箱、占用拒绝、确认邮件发出；build 通过。

---

## Task 3（kimi）：档案重命名 / 删除

**Files:** Create `apps/web/app/api/account/rename/route.ts`；Modify `apps/web/app/profiles/page.tsx`
- [ ] Step 1: `rename/route.ts` POST({profileId, nickname}): `resolveUid`；service_role `update profiles set nickname=trim(nickname) where id=profileId and user_id=uid`（核对归属；只改 nickname）；空/超长校验。返回 `{ok}`。
- [ ] Step 2: `/profiles`: 每档案加「重命名」(输入→调 rename→刷新) 与「删除」(二次确认→现有删除路径：TG `tgDeleteProfile`/web `deleteProfile`)。明暗适配；`hasTgSession` 决定走 TG/web 数据路径。
- [ ] Step 3: build。提交 `feat(account-mgmt): 档案重命名/删除 [EP-am-3]`

**验收：** 重命名只改 nickname、命盘不变、非归属拒绝；删除二次确认；build 通过。

---

## Task 4（kimi）：注销账号

**Files:** Create `apps/web/app/api/account/delete/route.ts`；Modify `apps/web/app/account/page.tsx`
- [ ] Step 1: `delete/route.ts` POST(需确认标志): `resolveUid`；service_role `admin.auth.admin.deleteUser(uid)`（级联删 profiles/spirit_messages/entitlements/llm_usage/tg_users）；清 `zj_tg`+`zj_tg_hint` cookie。返回 `{ok}`。
- [ ] Step 2: `/account`「危险区 · 注销账号」：二次确认（勾选/输入「注销」）→ 调 delete → 成功后 `signOutWeb()`（web）+ 跳首页/重载（回全新匿名）。强红色警示、明暗适配。
- [ ] Step 3: build。提交 `feat(account-mgmt): 注销账号(级联删+清会话) [EP-am-4]`

**验收：** 注销级联删净、会话清空、二次确认、不可逆提示；build 通过。

## 上线（claude）
T1-4 accepted + core/llm 测 + build 全绿 → 合 main → 手动触发部署（自动部署本会话不稳，用 `POST /v13/deployments forceNew=1+sha`）。更新 CURRENT.md + memory。

## 编排
owner kimi / reviewer claude（pact `account-mgmt`）。波次：T1 展示+补绑TG → T2 补绑email → T3 重命名/删除 → T4 注销。claude 每波 build+审+提交+accept。之后：i18n。
