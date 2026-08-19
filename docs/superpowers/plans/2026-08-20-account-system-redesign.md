# 账号体系重建（EP-account2）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重建账号身份语义（诚实的「已验证邮箱」信号）、统一会话签发/解析/客户端真值、把身份绑定改成对称操作、堵上 LLM 闸门的静默放行漏洞，并补齐这个仓库唯一零覆盖的鉴权面的测试。

**Architecture:** 保留 `auth.users` 为账号主体（方案 A，spec §2）。新增一个全站单一事实源 `resolveAccess(uid)` 判定三层访问语义（anonymous/identified/member），把会话签发/解析收敛到共享常量与 `resolveUid()`，把身份绑定收成一个 `attachIdentity()` 概念。破坏性重建——线上无真实用户数据，不写兼容层、不做迁移波。

**Tech Stack:** Next.js App Router API routes（Node runtime）、Supabase Auth（`auth.users` + `auth.admin.*`）、Supabase Postgres（RLS + `security definer` RPC）、Vitest（`@vitest-environment node` 用于 route 测试）。

## Global Constraints

- **不写兼容层、可破坏性重建**——线上仅测试号（spec §1 owner 决策）。
- **`resolveAccess` 必须排除合成邮箱域名**（`@zhaojian.local`），不能依赖 Supabase 的 `email_confirmed_at` 表面值——TG 影子用户创建时就带 `email_confirm: true`，这个字段本身已经被污染，排除逻辑必须是**独立**的域名判断，不是"等影子邮箱消失了就能信任这个字段"（spec §3）。
- **会话 TTL 单一常量驱动**：token `exp` 与 cookie `maxAge` 不允许在任何两处分别硬编码同一个值（spec §4①）。取值 30 天 + 剩余 <7 天时续期。
- **`resolveUid()` 禁止依赖 `next/headers` 的 `cookies()`**——这个仓库的 route 测试统一用「直接 import handler + 手搓 `Request` 调用」的方式（不经过 Next 真实分发），`cookies()` 依赖的 AsyncLocalStorage 在这种调用方式下不可靠（`apps/web/app/api/fengshui/reading/route.ts:16-26` 的既有注释已踩过这个坑并改成读 `req.headers.get("cookie")`）。本次统一必须朝这个方向收敛，不能反过来让 `fengshui/reading`/`billing/status` 去依赖 `cookies()`。
- **`attachIdentity` 前置校验统一三条**：会话有效 / 该身份未被其他账号占用（409）/ 本账号尚未绑过该类型（spec §5）。
- **发起支付前必须校验 `hasVerifiedEmail`**——本轮不接支付本体（Stripe/Stars 卡凭据，留给 billing spec T5/T6），只交付可复用的校验函数，供未来 checkout 路由调用。
- **所有 `consumeLlm` 调用点，取不到已识别身份必须拒绝**，不得静默放行（锁死 spec §1 提到的 `if (userId)` 漏洞）。
- **`v1 明确不做`**（spec §8）：支付集成本体、Google/Apple 登录实装、解绑身份、登出所有设备/服务端会话表、数据导出、家庭/团队账号、一次性邮箱防刷、同意项版本化管理机制。**不要在任何任务里顺手做这些**，哪怕看起来只差一点点。
- **测试纪律沿用本仓库既有标准**：变异实证（改坏对应逻辑，断言必须变红，然后还原）、无空转断言（每条断言自问「改坏了会红吗」）、route 测试用 `// @vitest-environment node` + 直接 import handler 的既有模式（参照 `apps/web/app/api/tg/dream/__tests__/route.test.ts`）。
- **两条「实施阶段必须实测」的前提**（spec §9）不得凭记忆写死：① `auth.admin.createUser({})` 不带 email 能否建用户；② Supabase 对同验证邮箱的默认归并行为。Task 8 的 Step 2 是①的实测点；②只影响 Task 4 是否需要额外配置，若实测发现有归并行为，在 Task 4 完成时记录进任务胶囊，不阻塞本计划其余任务。
- **迁移文件只创建 SQL，不在本地执行 `supabase db push` 或直接连生产库改表**——按本仓库既有流程，migration 文件写好、单测通过后交给验收方（reviewer）审核并 apply 到生产（`.agent/CURRENT.md` 里历次迁移记录的 "claude apply 成功" 就是这个流程）。

---

## File Structure

**新增文件：**
- `apps/web/lib/access.ts` — `resolveAccess()`，全站唯一三层访问判定；`SYNTHETIC_EMAIL_DOMAIN` 常量
- `apps/web/lib/access.test.ts` — 上面的单测
- `apps/web/lib/tg/__tests__/session.test.ts` — 会话签发/解析/续期判定单测
- `apps/web/lib/account/__tests__/uid.test.ts` — `resolveUid` 单测
- `apps/web/lib/tg/__tests__/identity.test.ts` — `attachIdentity` 单测
- `apps/web/app/api/account/attach/route.ts` — 新的对称绑定路由（替换 `link-email`/`link-telegram`）
- `apps/web/app/api/account/attach/__tests__/route.test.ts`
- `apps/web/lib/billing-gate.ts` — `requireVerifiedEmailForPayment()`，供未来 checkout 路由调用
- `apps/web/lib/billing-gate.test.ts`
- `apps/web/app/api/spirit/chat/__tests__/route.test.ts`（此前不存在）
- `apps/web/app/api/spirit/dream/__tests__/route.test.ts` 已存在，本计划只追加用例，不新建
- `apps/web/lib/tg/__tests__/merge.test.ts`
- `apps/web/lib/__tests__/user-data-cascade.test.ts` — 读迁移文件，不连库
- `apps/web/lib/consent.ts` — `recordConsentOnce()`
- `apps/web/lib/__tests__/consent.test.ts`
- `supabase/migrations/0012_profiles_cascade.sql`
- `supabase/migrations/0013_user_consents.sql`

**修改文件：**
- `packages/core/src/tg/session.ts` — `verifySession` 返回值追加 `exp`
- `packages/core/test/tg-session.test.ts` — 同步断言
- `apps/web/lib/tg/session.ts` — TTL 常量、`makeSessionToken` 用常量、新增 `sessionNeedsRefresh()`
- `apps/web/lib/account/uid.ts` — `resolveUid` 改用 `req.headers.get("cookie")`，返回值追加 `needsRefresh`
- `apps/web/app/api/tg/session/route.ts` — POST 的 `maxAge` 用常量；GET 升级为「确认 + 按需续期 + 无效则清 cookie」
- `apps/web/app/api/auth/telegram/route.ts` — `maxAge` 用常量
- `apps/web/app/api/fengshui/reading/route.ts` — 本地 `resolveUserId` 删除，改调 `resolveUid`
- `apps/web/app/api/billing/status/route.ts` — 同上
- `apps/web/app/account/page.tsx` — 真正消费 `/api/tg/session` 的响应；无效会话落到未登录态
- `apps/web/lib/tg/identity.ts` — `resolveOrCreateTgUser` 引用共享的 `SYNTHETIC_EMAIL_DOMAIN`；新用户创建成功后调 `recordConsentOnce`；Task 8 再改创建分支本身
- `apps/web/app/api/account/identities/route.ts` — 引用共享常量；`resolveAccess(uid).level !== "anonymous"` 时调 `recordConsentOnce`
- `apps/web/app/api/spirit/chat/route.ts` — 未识别身份拒绝而非静默放行
- `apps/web/app/api/spirit/dream/route.ts` — 同上
- `apps/web/lib/tg/merge.ts` — 改为调用事务性 RPC
- `.agent/CURRENT.md` — Task 8 末尾补交付记录

**删除文件：**
- `apps/web/app/api/account/link-email/route.ts` — 被 `attach/route.ts` 取代（Task 4）
- `apps/web/app/api/account/link-telegram/route.ts` — 同上

---

## Task 1: `resolveAccess` 三层访问判定

**Files:**
- Create: `apps/web/lib/access.ts`
- Create: `apps/web/lib/access.test.ts`
- Modify: `apps/web/app/api/account/identities/route.ts:12-13`（复用共享常量）

**Interfaces:**
- Produces: `SYNTHETIC_EMAIL_DOMAIN = "zhaojian.local"`；`type AccessLevel = "anonymous" | "identified" | "member"`；`resolveAccess(uid: string): Promise<{ level: AccessLevel; hasVerifiedEmail: boolean; hasTelegram: boolean }>`——后续所有任务（2/4/5/7/8）都会 import 这两个符号。

- [ ] **Step 1: 写失败测试**

创建 `apps/web/lib/access.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserByIdMock = vi.fn();
const tgUsersMaybeSingleMock = vi.fn();
const getEntitlementMock = vi.fn();

vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: { admin: { getUserById: (...a: unknown[]) => getUserByIdMock(...a) } },
    from: (table: string) => {
      if (table !== "tg_users") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => tgUsersMaybeSingleMock() }),
        }),
      };
    },
  }),
}));
vi.mock("@/lib/entitlements", () => ({
  getEntitlement: (...a: unknown[]) => getEntitlementMock(...a),
  isMember: (e: { tier: string; memberUntil: string | null }) =>
    e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now(),
}));

const { resolveAccess, SYNTHETIC_EMAIL_DOMAIN } = await import("./access");

function user(email: string | null, confirmed: boolean) {
  return { data: { user: email ? { email, email_confirmed_at: confirmed ? "2026-01-01T00:00:00Z" : null } : null } };
}

beforeEach(() => {
  vi.clearAllMocks();
  tgUsersMaybeSingleMock.mockResolvedValue({ data: null });
  getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
});

describe("resolveAccess", () => {
  it("无 TG 映射、无邮箱 → anonymous", async () => {
    getUserByIdMock.mockResolvedValue(user(null, false));
    const r = await resolveAccess("u1");
    expect(r).toEqual({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
  });

  it(`影子邮箱（@${SYNTHETIC_EMAIL_DOMAIN}）即使 email_confirmed_at 有值也不算 hasVerifiedEmail`, async () => {
    getUserByIdMock.mockResolvedValue(user(`tg_123@${SYNTHETIC_EMAIL_DOMAIN}`, true));
    const r = await resolveAccess("u1");
    expect(r.hasVerifiedEmail).toBe(false);
  });

  it("真实邮箱但未验证（email_confirmed_at 为空）→ 不算 hasVerifiedEmail", async () => {
    getUserByIdMock.mockResolvedValue(user("a@x.com", false));
    const r = await resolveAccess("u1");
    expect(r.hasVerifiedEmail).toBe(false);
    expect(r.level).toBe("anonymous");
  });

  it("真实已验证邮箱 → identified，hasVerifiedEmail=true", async () => {
    getUserByIdMock.mockResolvedValue(user("a@x.com", true));
    const r = await resolveAccess("u1");
    expect(r).toEqual({ level: "identified", hasVerifiedEmail: true, hasTelegram: false });
  });

  it("有 TG 映射、无邮箱 → identified，hasTelegram=true", async () => {
    getUserByIdMock.mockResolvedValue(user(null, false));
    tgUsersMaybeSingleMock.mockResolvedValue({ data: { supabase_user_id: "u1" } });
    const r = await resolveAccess("u1");
    expect(r).toEqual({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
  });

  it("有 TG 映射但邮箱未验证 → identified 但不是 member（即使 entitlements 表里 tier=member）", async () => {
    getUserByIdMock.mockResolvedValue(user(null, false));
    tgUsersMaybeSingleMock.mockResolvedValue({ data: { supabase_user_id: "u1" } });
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01T00:00:00Z" });
    const r = await resolveAccess("u1");
    expect(r.level).toBe("identified"); // 不是 member——member 要求 hasVerifiedEmail
  });

  it("已验证邮箱 + entitlements 里有效订阅 → member", async () => {
    getUserByIdMock.mockResolvedValue(user("a@x.com", true));
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01T00:00:00Z" });
    const r = await resolveAccess("u1");
    expect(r.level).toBe("member");
  });

  it("已验证邮箱但订阅过期 → identified 不是 member", async () => {
    getUserByIdMock.mockResolvedValue(user("a@x.com", true));
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2020-01-01T00:00:00Z" });
    const r = await resolveAccess("u1");
    expect(r.level).toBe("identified");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- lib/access.test.ts`
Expected: FAIL——`./access` 模块不存在。

- [ ] **Step 3: 实现**

创建 `apps/web/lib/access.ts`：

```ts
import { supabaseAdmin } from "@/lib/tg/admin";
import { getEntitlement, isMember } from "@/lib/entitlements";

/**
 * TG 影子用户创建时用的合成邮箱域名（见 lib/tg/identity.ts 的 resolveOrCreateTgUser）。
 * 单一事实源——这个域名此前在 identity.ts 和 api/account/identities/route.ts 里
 * 各硬编码一份，任何一处漏改都会让「已验证邮箱」这个信号重新被污染。
 */
export const SYNTHETIC_EMAIL_DOMAIN = "zhaojian.local";

export type AccessLevel = "anonymous" | "identified" | "member";

export type AccessInfo = {
  level: AccessLevel;
  /** 真实、已验证、非合成域名的邮箱——不认 email_confirmed_at 的表面值。 */
  hasVerifiedEmail: boolean;
  hasTelegram: boolean;
};

/**
 * 全站唯一访问层级事实源（EP-account2-01）。替代散落各处的
 * isTelegram()/hasTgSession()/裸 uid 判断。三层语义见 spec §3：
 *   anonymous  — 无 TG 映射且无真实已验证邮箱：只能排盘/看确定性内容
 *   identified — 有 TG 映射或有真实已验证邮箱：可用 LLM 解读，计入免费额度
 *   member     — identified + 有效订阅 + hasVerifiedEmail：会员权益
 * 纯读取，无副作用——身份建立时的条款记录（consent）是独立的调用点，不在这里做。
 */
export async function resolveAccess(uid: string): Promise<AccessInfo> {
  const sb = supabaseAdmin();

  const [{ data: userRes }, { data: tgRow }] = await Promise.all([
    sb.auth.admin.getUserById(uid),
    sb.from("tg_users").select("supabase_user_id").eq("supabase_user_id", uid).maybeSingle(),
  ]);

  const email = userRes.user?.email ?? null;
  const emailConfirmed = !!userRes.user?.email_confirmed_at;
  const isSynthetic = !!email && email.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
  const hasVerifiedEmail = emailConfirmed && !!email && !isSynthetic;
  const hasTelegram = !!tgRow;

  const identified = hasTelegram || hasVerifiedEmail;
  let level: AccessLevel = identified ? "identified" : "anonymous";
  if (identified && hasVerifiedEmail) {
    const ent = await getEntitlement(uid);
    if (isMember(ent)) level = "member";
  }

  return { level, hasVerifiedEmail, hasTelegram };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- lib/access.test.ts`
Expected: 8 个用例全部 PASS。

- [ ] **Step 5: 复用共享常量，去掉重复的域名字符串**

修改 `apps/web/app/api/account/identities/route.ts`：

```diff
 import { NextResponse } from "next/server";
 import { resolveUid } from "@/lib/account/uid";
 import { supabaseAdmin } from "@/lib/tg/admin";
+import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/access";
```

```diff
   const rawEmail = u.user?.email ?? null;
   const email =
-    rawEmail && !rawEmail.endsWith("@zhaojian.local") ? rawEmail : null;
+    rawEmail && !rawEmail.endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`) ? rawEmail : null;
```

Run: `pnpm --filter @eamvp/web test -- app/api/account/identities`（若此前无测试文件，本步无需新增——Task 4 会给这个路由簇补测试；本步只确认 typecheck 不破）
Run: `pnpm typecheck`
Expected: 0 errors。

- [ ] **Step 6: 提交**

```bash
git add apps/web/lib/access.ts apps/web/lib/access.test.ts apps/web/app/api/account/identities/route.ts
git commit -m "[EP-account2-01] resolveAccess 三层访问判定 + 合成邮箱域名单一事实源"
```

---

## Task 2: 会话统一——单一 TTL 常量、`resolveUid` 改造、滑动续期原语

**Files:**
- Modify: `packages/core/src/tg/session.ts`
- Modify: `packages/core/test/tg-session.test.ts`
- Modify: `apps/web/lib/tg/session.ts`
- Create: `apps/web/lib/tg/__tests__/session.test.ts`
- Modify: `apps/web/lib/account/uid.ts`
- Create: `apps/web/lib/account/__tests__/uid.test.ts`
- Modify: `apps/web/app/api/tg/session/route.ts:POST`（`maxAge` 用常量）
- Modify: `apps/web/app/api/auth/telegram/route.ts`（`maxAge` 用常量）
- Modify: `apps/web/app/api/fengshui/reading/route.ts`（本地 `resolveUserId` 删除，改调 `resolveUid`）
- Modify: `apps/web/app/api/billing/status/route.ts`（同上）

**Interfaces:**
- Consumes: 无（本任务不依赖 Task 1）
- Produces: `apps/web/lib/tg/session.ts` 导出 `SESSION_TTL_SECONDS`、`SESSION_REFRESH_THRESHOLD_SECONDS`、`sessionNeedsRefresh(exp: number): boolean`、`makeSessionToken(uid: string, tgId: number): string`（签名不变，行为改）、`readSession(token: string | undefined): { uid: string; tgId: number; exp: number } | null`（返回值新增 `exp`）。`apps/web/lib/account/uid.ts` 导出 `resolveUid(req: Request): Promise<{ uid: string; via: "tg" | "web"; needsRefresh: boolean } | null>`（签名新增 `needsRefresh`）——Task 3/4/5/7 都会用这个返回值。

- [ ] **Step 1: 核心层——`verifySession` 返回值追加 `exp`（写失败测试）**

修改 `packages/core/test/tg-session.test.ts`：

```diff
   it("round-trip", () => {
     const t = signSession({ uid: "u1", tgId: 42, exp: Math.floor(Date.now()/1000)+60 }, S);
-    expect(verifySession(t, S)).toEqual({ uid: "u1", tgId: 42 });
+    const exp = Math.floor(Date.now()/1000)+60;
+    const t2 = signSession({ uid: "u1", tgId: 42, exp }, S);
+    expect(verifySession(t2, S)).toEqual({ uid: "u1", tgId: 42, exp });
   });
```

（把原来的 `t`/断言整体替换成上面这段——保留过期/篡改两条不变，它们只断言 `toBeNull()`，不受影响。）

Run: `pnpm --filter @eamvp/core test -- test/tg-session.test.ts`
Expected: FAIL——`verifySession` 目前不返回 `exp`。

- [ ] **Step 2: 实现——`verifySession` 返回 `exp`**

修改 `packages/core/src/tg/session.ts`：

```diff
-export function verifySession(token: string, secret: string): { uid: string; tgId: number } | null {
+export function verifySession(token: string, secret: string): { uid: string; tgId: number; exp: number } | null {
   const parts = token.split(".");
   if (parts.length !== 2) return null;
   const [header, sig] = parts;
   if (!header || !sig) return null;
   const expected = base64urlEncode(createHmac("sha256", secret).update(header).digest());
   const a = Buffer.from(sig, "utf8");
   const b = Buffer.from(expected, "utf8");
   if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
   try {
     const payload = JSON.parse(base64urlDecode(header).toString("utf8"));
     if (!payload || typeof payload.uid !== "string" || typeof payload.tgId !== "number" || typeof payload.exp !== "number") return null;
     if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
-    return { uid: payload.uid, tgId: payload.tgId };
+    return { uid: payload.uid, tgId: payload.tgId, exp: payload.exp };
   } catch {
     return null;
   }
 }
```

Run: `pnpm --filter @eamvp/core test -- test/tg-session.test.ts`
Expected: PASS。

- [ ] **Step 3: `apps/web` 层——TTL 常量 + 续期判定（写失败测试）**

创建 `apps/web/lib/tg/__tests__/session.test.ts`：

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const { makeSessionToken, readSession, sessionNeedsRefresh, SESSION_TTL_SECONDS, SESSION_REFRESH_THRESHOLD_SECONDS } =
  await import("../session");

describe("会话 TTL：单一常量驱动（EP-account2-02）", () => {
  it("makeSessionToken 签发的 exp 精确等于 now + SESSION_TTL_SECONDS（不再是硬编码 3600）", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = makeSessionToken("u1", 42);
    const s = readSession(token)!;
    expect(s.exp).toBeGreaterThanOrEqual(before + SESSION_TTL_SECONDS);
    expect(s.exp).toBeLessThanOrEqual(before + SESSION_TTL_SECONDS + 5); // 5s 执行余量
  });

  it("SESSION_TTL_SECONDS 是 30 天", () => {
    expect(SESSION_TTL_SECONDS).toBe(60 * 60 * 24 * 30);
  });

  it("sessionNeedsRefresh：剩余时间 < 阈值 → true；>= 阈值 → false", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(sessionNeedsRefresh(now + SESSION_REFRESH_THRESHOLD_SECONDS - 1)).toBe(true);
    expect(sessionNeedsRefresh(now + SESSION_REFRESH_THRESHOLD_SECONDS + 1)).toBe(false);
  });

  it("SESSION_REFRESH_THRESHOLD_SECONDS 是 7 天", () => {
    expect(SESSION_REFRESH_THRESHOLD_SECONDS).toBe(60 * 60 * 24 * 7);
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- lib/tg/__tests__/session.test.ts`
Expected: FAIL——`sessionNeedsRefresh`/`SESSION_TTL_SECONDS`/`SESSION_REFRESH_THRESHOLD_SECONDS` 不存在，且现有 `makeSessionToken` 硬编码 3600。

- [ ] **Step 5: 实现**

修改 `apps/web/lib/tg/session.ts`（整个文件替换为）：

```ts
import { signSession, verifySession } from "@eamvp/core";

export const TG_COOKIE = "zj_tg";

/** 30 天滑动会话——无状态签名 cookie，无服务端吊销（已接受的权衡，spec §4①）。 */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
/** 剩余时间少于这个阈值时，下一次已鉴权请求上重新签发。 */
export const SESSION_REFRESH_THRESHOLD_SECONDS = 60 * 60 * 24 * 7;

export function makeSessionToken(uid: string, tgId: number): string {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET 未配置");
  return signSession({ uid, tgId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }, secret);
}

export function readSession(token: string | undefined): { uid: string; tgId: number; exp: number } | null {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return null;
  return verifySession(token, secret);
}

/** exp 距现在不足 SESSION_REFRESH_THRESHOLD_SECONDS → 该续期了。 */
export function sessionNeedsRefresh(exp: number): boolean {
  return exp - Math.floor(Date.now() / 1000) < SESSION_REFRESH_THRESHOLD_SECONDS;
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- lib/tg/__tests__/session.test.ts`
Expected: PASS。

- [ ] **Step 7: `resolveUid` 改造——不依赖 `next/headers`，追加 `needsRefresh`（写失败测试）**

创建 `apps/web/lib/account/__tests__/uid.test.ts`：

```ts
// @vitest-environment node
//
// 刻意不 mock next/headers——resolveUid 改造后只依赖 req.headers，
// 用手搓 Request 直接验证（同 api/fengshui/reading route 测试的既有理由：
// 这个仓库的 route 测试统一走「直接 import handler + Request」，不经过
// Next 真实分发，next/headers 的 cookies() 在这种调用方式下不可靠）。
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");

const getUserMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (...a: unknown[]) => getUserMock(...a) } }),
}));

const { resolveUid } = await import("../uid");
const { makeSessionToken, SESSION_REFRESH_THRESHOLD_SECONDS } = await import("@/lib/tg/session");

function reqWithCookie(cookie: string): Request {
  return new Request("http://x/api/whatever", { headers: { cookie } });
}

beforeEach(() => vi.clearAllMocks());

describe("resolveUid：不依赖 next/headers，只读 Request 本身", () => {
  it("有效 zj_tg cookie → via=tg，needsRefresh=false（新签发的 token 远未到期）", async () => {
    const token = makeSessionToken("u1", 42);
    const r = await resolveUid(reqWithCookie(`zj_tg=${token}`));
    expect(r).toEqual({ uid: "u1", via: "tg", needsRefresh: false });
  });

  it("zj_tg cookie 快过期（剩余 < 7 天）→ needsRefresh=true", async () => {
    // 直接构造一个剩余时间在阈值内的 token：复用 signSession 而不是等 30 天。
    const { signSession } = await import("@eamvp/core");
    const exp = Math.floor(Date.now() / 1000) + SESSION_REFRESH_THRESHOLD_SECONDS - 10;
    const token = signSession({ uid: "u1", tgId: 42, exp }, "test-secret");
    const r = await resolveUid(reqWithCookie(`zj_tg=${token}`));
    expect(r).toEqual({ uid: "u1", via: "tg", needsRefresh: true });
  });

  it("无 zj_tg cookie，有 Bearer → via=web，needsRefresh 恒 false（web 会话由 Supabase 自己管刷新）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u2" } } });
    const req = new Request("http://x/api/whatever", { headers: { authorization: "Bearer tok" } });
    const r = await resolveUid(req);
    expect(r).toEqual({ uid: "u2", via: "web", needsRefresh: false });
  });

  it("cookie 与 Bearer 都没有 → null", async () => {
    const r = await resolveUid(new Request("http://x/api/whatever"));
    expect(r).toBeNull();
  });

  it("cookie 存在但已过期/篡改，Bearer 兜底成立 → 走 web 分支", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u3" } } });
    const req = new Request("http://x/api/whatever", {
      headers: { cookie: "zj_tg=garbage", authorization: "Bearer tok" },
    });
    const r = await resolveUid(req);
    expect(r).toEqual({ uid: "u3", via: "web", needsRefresh: false });
  });
});
```

- [ ] **Step 8: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- lib/account/__tests__/uid.test.ts`
Expected: FAIL——当前 `resolveUid` 用 `next/headers` 的 `cookies()`（在这个直接 `new Request()` 调用方式下拿不到 cookie），且返回值没有 `needsRefresh`。

- [ ] **Step 9: 实现**

修改 `apps/web/lib/account/uid.ts`（整个文件替换为）：

```ts
import { readSession, sessionNeedsRefresh, TG_COOKIE } from "@/lib/tg/session";
import { supabaseAdmin } from "@/lib/tg/admin";

/**
 * 全站唯一 uid 解析入口（EP-account2-02）。
 *
 * ⚠️ 故意只读 `req.headers`，不用 `next/headers` 的 `cookies()`：那个 API 依赖
 * Next 请求处理内部的 AsyncLocalStorage 上下文，只有真正经过 Next 路由分发时才会
 * 被填充。这个仓库的 route 测试统一是「直接 import handler、拿手搓 Request 调用」
 * （不经过 Next 开发/构建服务器），cookies() 在这种调用方式下不可靠——
 * api/fengshui/reading/route.ts 和 api/billing/status/route.ts 早先各自独立踩过
 * 这个坑、各写了一份手动解析 cookie 的重复代码。本函数改造后可以被这两处直接复用
 * （见本任务 Step 10/11），从「3 份重复实现」收敛到 1 份。
 */
export async function resolveUid(
  req: Request,
): Promise<{ uid: string; via: "tg" | "web"; needsRefresh: boolean } | null> {
  // 1) Telegram session cookie (zj_tg)
  const cookieHeader = req.headers.get("cookie") ?? "";
  const tgToken = cookieHeader
    .split("; ")
    .find((c) => c.startsWith(`${TG_COOKIE}=`))
    ?.slice(TG_COOKIE.length + 1);
  const s = readSession(tgToken);
  if (s) return { uid: s.uid, via: "tg", needsRefresh: sessionNeedsRefresh(s.exp) };

  // 2) Web session via Authorization Bearer token
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data } = await supabaseAdmin().auth.getUser(token);
    if (data.user) return { uid: data.user.id, via: "web", needsRefresh: false };
  }

  return null;
}
```

- [ ] **Step 10: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- lib/account/__tests__/uid.test.ts`
Expected: 5 个用例全部 PASS。

- [ ] **Step 11: 三处发布点改用共享常量/共享解析——`api/tg/session` POST**

修改 `apps/web/app/api/tg/session/route.ts`：

```diff
-import { makeSessionToken, readSession, TG_COOKIE } from "@/lib/tg/session";
+import { makeSessionToken, readSession, TG_COOKIE, SESSION_TTL_SECONDS } from "@/lib/tg/session";
```

```diff
   res.cookies.set(TG_COOKIE, makeSessionToken(supabaseUserId, v.user.id), {
-    httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 3600,
+    httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: SESSION_TTL_SECONDS,
   });
```

- [ ] **Step 12: `api/auth/telegram` POST 改用共享常量**

修改 `apps/web/app/api/auth/telegram/route.ts`：

```diff
-import { makeSessionToken, TG_COOKIE } from "@/lib/tg/session";
+import { makeSessionToken, TG_COOKIE, SESSION_TTL_SECONDS } from "@/lib/tg/session";
```

```diff
   const res = NextResponse.json({ ok: true, merged });
-  const maxAge = 60 * 60 * 24 * 30;
+  const maxAge = SESSION_TTL_SECONDS;
   res.cookies.set(TG_COOKIE, makeSessionToken(supabaseUserId, v.id), {
```

- [ ] **Step 13: 收敛 `api/fengshui/reading` 的重复解析——改调 `resolveUid`**

修改 `apps/web/app/api/fengshui/reading/route.ts`：

```diff
-import { readSession, TG_COOKIE } from "@/lib/tg/session";
-import { supabaseAdmin } from "@/lib/tg/admin";
+import { resolveUid } from "@/lib/account/uid";
```

```diff
-/**
- * 从请求里解析 uid（Task 10，EP-fs-17 会员闸门）。手法与 billing/status/route.ts
- * 完全一致：TG 会话 cookie（zj_tg）优先，Authorization Bearer 兜底（邮箱登录等非
- * TG 场景）。
- *
- * ⚠️ 特意不用 `@/lib/account/uid.ts` 的 `resolveUid()`：那个实现依赖 `next/headers`
- * 的 `cookies()`，读取的是 Next 请求处理内部维护的 AsyncLocalStorage 上下文，只有
- * 真正经由 Next 的路由分发时才会被填充。本路由的测试直接 `import { POST, GET }`
- * 后拿一个手搓的 `Request` 调用（不经过 Next 的开发/构建服务器，见 route.test.ts
- * 顶部注释），没有那层上下文，`cookies()` 在这种调用方式下不可靠。改成直接读
- * `req.headers.get("cookie")`——只依赖 Request 对象本身，两种调用方式下行为一致。
- */
-async function resolveUserId(req: Request): Promise<string | undefined> {
-  const cookieHeader = req.headers.get("cookie") ?? "";
-  const tgToken = cookieHeader
-    .split("; ")
-    .find((c) => c.startsWith(`${TG_COOKIE}=`))
-    ?.slice(TG_COOKIE.length + 1);
-  const tgSession = readSession(tgToken);
-  if (tgSession) return tgSession.uid;
-
-  const auth = req.headers.get("authorization");
-  if (auth?.startsWith("Bearer ")) {
-    const token = auth.slice(7);
-    const { data } = await supabaseAdmin().auth.getUser(token);
-    return data.user?.id;
-  }
-  return undefined;
-}
+/**
+ * EP-account2-02：resolveUid() 改造后不再依赖 next/headers 的 cookies()，
+ * 两处曾经各自独立重复的手动 cookie 解析（本文件与 billing/status/route.ts）
+ * 现在可以安全收敛成一处。
+ */
+async function resolveUserId(req: Request): Promise<string | undefined> {
+  const resolved = await resolveUid(req);
+  return resolved?.uid;
+}
```

（本文件其余调用 `resolveUserId(req)` 的地方不变——函数名和签名保持一致，改的只是内部实现。）

- [ ] **Step 14: 跑既有测试确认零回归**

Run: `pnpm --filter @eamvp/web test -- app/api/fengshui/reading`
Expected: 既有测试全部 PASS 不改一条断言——这是这次收敛正确性的强验证（这个文件此前对 TG cookie 和 Bearer 两条路径都有覆盖，见 `route.test.ts:337`）。

- [ ] **Step 15: 收敛 `api/billing/status` 的重复解析**

修改 `apps/web/app/api/billing/status/route.ts`：

```diff
-import { NextResponse } from "next/server";
-import { readSession, TG_COOKIE } from "@/lib/tg/session";
-import { supabaseAdmin } from "@/lib/tg/admin";
-import { getEntitlement, isMember } from "@/lib/entitlements";
+import { NextResponse } from "next/server";
+import { resolveUid } from "@/lib/account/uid";
+import { supabaseAdmin } from "@/lib/tg/admin";
+import { getEntitlement, isMember } from "@/lib/entitlements";
 
 export const runtime = "nodejs";
 export const dynamic = "force-dynamic";
 
 export async function GET(req: Request): Promise<Response> {
-  let userId: string | undefined;
-
-  // 1) Telegram session (zj_tg cookie)
-  const cookieHeader = req.headers.get("cookie") ?? "";
-  const tgToken = cookieHeader
-    .split("; ")
-    .find((c) => c.startsWith(`${TG_COOKIE}=`))
-    ?.slice(TG_COOKIE.length + 1);
-  const tgSession = readSession(tgToken);
-  if (tgSession) {
-    userId = tgSession.uid;
-  } else {
-    // 2) Web session (Authorization Bearer token)
-    const auth = req.headers.get("authorization");
-    if (auth?.startsWith("Bearer ")) {
-      const token = auth.slice(7);
-      const { data } = await supabaseAdmin().auth.getUser(token);
-      userId = data.user?.id;
-    }
-  }
+  const resolved = await resolveUid(req);
+  const userId = resolved?.uid;
```

- [ ] **Step 16: 补 `billing/status` 的路由测试（此前零覆盖）**

创建 `apps/web/app/api/billing/status/__tests__/route.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveUidMock = vi.fn();
vi.mock("@/lib/account/uid", () => ({ resolveUid: (...a: unknown[]) => resolveUidMock(...a) }));

const getEntitlementMock = vi.fn();
const usageMaybeSingleMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  getEntitlement: (...a: unknown[]) => getEntitlementMock(...a),
  isMember: (e: { tier: string; memberUntil: string | null }) =>
    e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now(),
}));
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => usageMaybeSingleMock() }) }) }) }),
  }),
}));

const { GET } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  usageMaybeSingleMock.mockResolvedValue({ data: { uses: 3 } });
  getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
});

describe("GET /api/billing/status", () => {
  it("resolveUid 解析不出身份 → free/未用量，不查 entitlements（未登录也要有响应，不是 401）", async () => {
    resolveUidMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"));
    const json = await res.json();
    expect(json).toMatchObject({ tier: "free", memberUntil: null, used: 0 });
    expect(getEntitlementMock).not.toHaveBeenCalled();
  });

  it("resolveUid 解析出 uid（不论 via）→ 查 entitlements 与本月用量", async () => {
    resolveUidMock.mockResolvedValue({ uid: "u1", via: "tg", needsRefresh: false });
    const res = await GET(new Request("http://x"));
    const json = await res.json();
    expect(getEntitlementMock).toHaveBeenCalledWith("u1");
    expect(json.used).toBe(3);
  });

  it("会员且未过期 → tier=member", async () => {
    resolveUidMock.mockResolvedValue({ uid: "u1", via: "web", needsRefresh: false });
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01T00:00:00Z" });
    const res = await GET(new Request("http://x"));
    expect((await res.json()).tier).toBe("member");
  });
});
```

- [ ] **Step 17: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- app/api/billing/status`
Expected: 3 个用例 PASS。

- [ ] **Step 18: 全量回归 + typecheck**

Run: `pnpm typecheck && pnpm --filter @eamvp/core test && pnpm --filter @eamvp/web test`
Expected: 全绿，0 errors。

- [ ] **Step 19: 提交**

```bash
git add packages/core/src/tg/session.ts packages/core/test/tg-session.test.ts \
  apps/web/lib/tg/session.ts apps/web/lib/tg/__tests__/session.test.ts \
  apps/web/lib/account/uid.ts apps/web/lib/account/__tests__/uid.test.ts \
  apps/web/app/api/tg/session/route.ts apps/web/app/api/auth/telegram/route.ts \
  apps/web/app/api/fengshui/reading/route.ts apps/web/app/api/billing/status/route.ts \
  apps/web/app/api/billing/status/__tests__/route.test.ts
git commit -m "[EP-account2-02] 会话 TTL 单一常量 + resolveUid 去 next/headers 依赖 + 收敛 3 份 cookie 解析"
```

---

## Task 3: 客户端真值——`/account` 真正消费会话确认结果

**Files:**
- Modify: `apps/web/app/api/tg/session/route.ts:GET`
- Modify: `apps/web/app/account/page.tsx:66-76`
- Create: `apps/web/app/api/tg/session/__tests__/route.test.ts`
- Modify: `apps/web/app/account/__tests__/page.test.tsx`（若不存在则创建）

**Interfaces:**
- Consumes: Task 2 的 `resolveUid`、`sessionNeedsRefresh`、`makeSessionToken`、`SESSION_TTL_SECONDS`、`TG_COOKIE`
- Produces: `GET /api/tg/session` 响应体从 `{ active: boolean }` 扩展为 `{ active: boolean; refreshed: boolean }`；`active=false` 时该响应同时清空 `zj_tg` 与 `zj_tg_hint` 两个 cookie。

- [ ] **Step 1: 写失败测试——GET 升级为确认+续期+清理**

创建 `apps/web/app/api/tg/session/__tests__/route.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");
afterEach(() => vi.unstubAllEnvs());

const { GET } = await import("../route");
const { makeSessionToken, SESSION_REFRESH_THRESHOLD_SECONDS, TG_COOKIE } = await import("@/lib/tg/session");

function reqWithCookie(cookie?: string): Request {
  return new Request("http://x/api/tg/session", cookie ? { headers: { cookie } } : {});
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/tg/session：确认 + 按需续期 + 无效清 cookie（EP-account2-03）", () => {
  it("无 cookie → active=false，响应里带清 cookie 的 Set-Cookie（maxAge=0）", async () => {
    const res = await GET(reqWithCookie());
    const json = await res.json();
    expect(json).toEqual({ active: false, refreshed: false });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${TG_COOKIE}=;`);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("有效且远未到期的 cookie → active=true，refreshed=false，不重签", async () => {
    const token = makeSessionToken("u1", 42);
    const res = await GET(reqWithCookie(`${TG_COOKIE}=${token}`));
    const json = await res.json();
    expect(json).toEqual({ active: true, refreshed: false });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("有效但快过期（剩余 < 7 天）→ active=true，refreshed=true，响应里带新 cookie", async () => {
    const { signSession } = await import("@eamvp/core");
    const exp = Math.floor(Date.now() / 1000) + SESSION_REFRESH_THRESHOLD_SECONDS - 10;
    const token = signSession({ uid: "u1", tgId: 42, exp }, "test-secret");
    const res = await GET(reqWithCookie(`${TG_COOKIE}=${token}`));
    const json = await res.json();
    expect(json).toEqual({ active: true, refreshed: true });
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`${TG_COOKIE}=`);
    expect(setCookie).not.toContain(`${TG_COOKIE}=;`); // 是新值，不是清空
  });

  it("cookie 被篡改/过期 → active=false 且清 cookie", async () => {
    const res = await GET(reqWithCookie(`${TG_COOKIE}=garbage`));
    const json = await res.json();
    expect(json.active).toBe(false);
    expect(res.headers.get("set-cookie") ?? "").toMatch(/Max-Age=0/i);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- app/api/tg/session/__tests__/route.test.ts`
Expected: FAIL——现有 GET 只返回 `{ active }`，不处理续期/清理。

- [ ] **Step 3: 实现**

修改 `apps/web/app/api/tg/session/route.ts`：

```diff
 import { NextResponse } from "next/server";
 import { verifyInitData } from "@eamvp/core";
 import { resolveOrCreateTgUser, getProfileForUser } from "@/lib/tg/identity";
-import { makeSessionToken, readSession, TG_COOKIE } from "@/lib/tg/session";
+import {
+  makeSessionToken,
+  readSession,
+  sessionNeedsRefresh,
+  TG_COOKIE,
+  SESSION_TTL_SECONDS,
+} from "@/lib/tg/session";
+
+const TG_HINT_COOKIE = "zj_tg_hint";
+
 export const runtime = "nodejs";
 export const dynamic = "force-dynamic";
+
 export async function GET(req: Request): Promise<Response> {
   const cookie = req.headers.get("cookie") ?? "";
   const token = cookie.split("; ").find((c) => c.startsWith(`${TG_COOKIE}=`))?.slice(TG_COOKIE.length + 1);
   const session = readSession(token);
-  return NextResponse.json({ active: !!session });
+
+  if (!session) {
+    const res = NextResponse.json({ active: false, refreshed: false });
+    res.cookies.set(TG_COOKIE, "", { maxAge: 0, path: "/" });
+    res.cookies.set(TG_HINT_COOKIE, "", { maxAge: 0, path: "/" });
+    return res;
+  }
+
+  if (sessionNeedsRefresh(session.exp)) {
+    const res = NextResponse.json({ active: true, refreshed: true });
+    const fresh = makeSessionToken(session.uid, session.tgId);
+    res.cookies.set(TG_COOKIE, fresh, {
+      httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: SESSION_TTL_SECONDS,
+    });
+    res.cookies.set(TG_HINT_COOKIE, "1", { secure: true, sameSite: "none", path: "/", maxAge: SESSION_TTL_SECONDS });
+    return res;
+  }
+
+  return NextResponse.json({ active: true, refreshed: false });
+}
```

（注意：diff 结尾多出的 `}` 是原文件 POST 之前那个 `}` ——replace 时把原 GET 函数体整段替换掉，POST 函数保持不变。）

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- app/api/tg/session/__tests__/route.test.ts`
Expected: 4 个用例 PASS。

- [ ] **Step 5: `/account` 页面真正消费确认结果（写失败测试）**

先看现有测试文件是否存在：

Run: `ls apps/web/app/account/__tests__/ 2>/dev/null || echo "不存在"`

若不存在，创建 `apps/web/app/account/__tests__/page.test.tsx`；若存在，在文件末尾追加下面这个 `describe` 块（保留既有用例不动）。无论哪种情况，都需要下面这组 mock 在文件顶部（若既有文件已经 mock 了同名模块，合并去重，不要重复 `vi.mock`）：

```tsx
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({
  getWebUser: vi.fn(async () => null),
  signInWithEmail: vi.fn(),
  signOutWeb: vi.fn(),
  upgradeAnonymousToEmail: vi.fn(),
  supabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));
const hasTgSessionMock = vi.fn(() => true);
vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => hasTgSessionMock(),
  tgLoginWithWidget: vi.fn(),
  tgLogout: vi.fn(),
}));
vi.mock("@/lib/tg/ui", () => ({ useIsTelegram: () => false }));
vi.mock("@/components/Paywall", () => ({ Paywall: () => null }));

const fetchMock = vi.fn(async (url: string) => {
  if (url === "/api/tg/session") return new Response(JSON.stringify({ active: true, refreshed: false }), { status: 200 });
  if (url.startsWith("/api/account/identities")) return new Response(JSON.stringify({ email: null, telegram: { username: "u1" } }), { status: 200 });
  if (url.startsWith("/api/billing/status")) return new Response(JSON.stringify({ tier: "free", memberUntil: null, used: 0, free: 30 }), { status: 200 });
  return new Response("{}", { status: 200 });
});

async function renderAccountPage() {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Page />, { wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider> });
  });
  return result;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  hasTgSessionMock.mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("EP-account2-03：/account 真正消费 /api/tg/session 的确认结果", () => {
  it("active=true → 保持已登录态（TG 视图渲染出来，不回退到匿名态）", async () => {
    await renderAccountPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/tg/session", expect.anything()));
    // TG 视图特征：账户危险区/登出按钮出现（既有 view.kind==="telegram" 分支才会渲染）
    expect(await screen.findByText("登出")).toBeInTheDocument();
  });

  it("active=false → 落到未登录态（不是继续假装已登录），且不再渲染登出按钮", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/tg/session") return new Response(JSON.stringify({ active: false, refreshed: false }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    await renderAccountPage();
    await waitFor(() => expect(screen.queryByText("登出")).toBeNull());
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- app/account/__tests__/page.test.tsx`
Expected: 第二条（`active=false`）FAIL——现在的代码丢弃响应体，永远停在 TG 视图。

- [ ] **Step 7: 实现**

修改 `apps/web/app/account/page.tsx`：

```diff
   useEffect(() => {
     async function resolve() {
       if (hasTgSession()) {
-        // Optional: confirm the server-side TG session is still active.
-        try {
-          await fetch("/api/tg/session", { credentials: "include" });
-        } catch {
-          // Ignore confirmation failures; keep TG state based on client hint.
-        }
+        // EP-account2-03：真正消费确认结果——hint cookie 只是「曾经登录过」的
+        // 长效标记，不是「现在仍然有效」的证明。失效必须真的落到未登录态，
+        // 不能假装还登录着（否则改名/绑邮箱/注销都会 401，用户却看不出为什么）。
+        try {
+          const res = await fetch("/api/tg/session", { credentials: "include" });
+          const json = (await res.json().catch(() => null)) as { active: boolean } | null;
+          if (!json?.active) {
+            setView({ kind: "anon", user: null });
+            return;
+          }
+        } catch {
+          // 网络异常：保留原有「先信客户端 hint」的降级行为，避免离线时把
+          // 已登录用户误判成未登录。
+        }
         const username = typeof localStorage !== "undefined" ? localStorage.getItem(TG_USERNAME_KEY) : null;
         setView({ kind: "telegram", username });
         return;
       }
       const user = await getWebUser();
       if (user && user.email && !user.isAnonymous) {
         setView({ kind: "email", email: user.email });
       } else {
         setView({ kind: "anon", user });
       }
     }
     resolve();
   }, []);
```

- [ ] **Step 8: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- app/account/__tests__/page.test.tsx`
Expected: 全部 PASS。

- [ ] **Step 9: 全量回归**

Run: `pnpm typecheck && pnpm --filter @eamvp/web test`
Expected: 全绿。

- [ ] **Step 10: 提交**

```bash
git add apps/web/app/api/tg/session/route.ts apps/web/app/api/tg/session/__tests__/route.test.ts \
  apps/web/app/account/page.tsx apps/web/app/account/__tests__/page.test.tsx
git commit -m "[EP-account2-03] /account 真正消费会话确认结果 + GET /api/tg/session 按需续期/清理"
```

---

## Task 4: `attachIdentity` 对称化

**Files:**
- Create: `apps/web/lib/tg/identity-link.ts`（`attachIdentity` 的实现放这里，避免 `lib/tg/identity.ts` 越长越杂）
- Create: `apps/web/lib/tg/__tests__/identity-link.test.ts`
- Create: `apps/web/app/api/account/attach/route.ts`
- Create: `apps/web/app/api/account/attach/__tests__/route.test.ts`
- Delete: `apps/web/app/api/account/link-email/route.ts`
- Delete: `apps/web/app/api/account/link-telegram/route.ts`
- Modify: `apps/web/app/account/page.tsx`（两处 `fetch("/api/account/link-email"|"link-telegram")` 改成 `/api/account/attach`）

**Interfaces:**
- Consumes: Task 2 的 `resolveUid`
- Produces: `attachIdentity(uid: string, identity: { kind: "email"; email: string } | { kind: "telegram"; tgId: number; username?: string }): Promise<{ ok: true } | { ok: false; error: "already_attached" | "taken" | "send_failed" | string }>`；`POST /api/account/attach` body `{ kind: "email", email } | { kind: "telegram", ...TgLoginParams }`，成功 200，冲突 409。

- [ ] **Step 1: 写失败测试——`attachIdentity`**

创建 `apps/web/lib/tg/__tests__/identity-link.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const listUsersMock = vi.fn();
const updateUserByIdMock = vi.fn();
const generateLinkMock = vi.fn();
const tgSelectMaybeSingleMock = vi.fn();
const tgInsertMock = vi.fn();

vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        listUsers: (...a: unknown[]) => listUsersMock(...a),
        updateUserById: (...a: unknown[]) => updateUserByIdMock(...a),
        generateLink: (...a: unknown[]) => generateLinkMock(...a),
      },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => tgSelectMaybeSingleMock() }) }),
      insert: (...a: unknown[]) => tgInsertMock(...a),
    }),
  }),
}));

const { attachIdentity } = await import("../identity-link");

beforeEach(() => {
  vi.clearAllMocks();
  listUsersMock.mockResolvedValue({ data: { users: [] } });
  updateUserByIdMock.mockResolvedValue({ error: null });
  generateLinkMock.mockResolvedValue({ error: null });
  tgSelectMaybeSingleMock.mockResolvedValue({ data: null });
  tgInsertMock.mockResolvedValue({ error: null });
});

describe("attachIdentity · email 分支", () => {
  it("邮箱未被占用 → 更新 email + 发 magic link", async () => {
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: true });
    expect(updateUserByIdMock).toHaveBeenCalledWith("u1", { email: "a@x.com" });
    expect(generateLinkMock).toHaveBeenCalledWith({ type: "magiclink", email: "a@x.com" });
  });

  it("邮箱已被别的账号占用 → taken（不调用 updateUserById）", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [{ id: "u2", email: "a@x.com" }] } });
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: false, error: "taken" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("邮箱已经是这个账号自己的（同 uid）→ 不算占用，正常放行", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [{ id: "u1", email: "a@x.com" }] } });
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: true });
  });
});

describe("attachIdentity · telegram 分支", () => {
  it("该 tg id 未被任何账号绑定 → 建映射", async () => {
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999, username: "bob" });
    expect(r).toEqual({ ok: true });
    expect(tgInsertMock).toHaveBeenCalledWith({ tg_user_id: 999, supabase_user_id: "u1", username: "bob" });
  });

  it("该 tg id 已绑定给别的账号 → already_attached（409 语义，不覆盖）", async () => {
    tgSelectMaybeSingleMock.mockResolvedValue({ data: { supabase_user_id: "other-uid" } });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: false, error: "already_attached" });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });

  it("该 tg id 已绑定给自己 → 视为成功（幂等，不重复插入）", async () => {
    tgSelectMaybeSingleMock.mockResolvedValue({ data: { supabase_user_id: "u1" } });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: true });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });
});

describe("attachIdentity · 尚未实装的 provider", () => {
  it("google/apple 明确抛「未实装」而不是静默失败——本轮只留接缝（spec §8）", async () => {
    await expect(
      attachIdentity("u1", { kind: "google" } as never),
    ).rejects.toThrow(/未实装|not implemented/i);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- lib/tg/__tests__/identity-link.test.ts`
Expected: FAIL——`../identity-link` 不存在。

- [ ] **Step 3: 实现**

创建 `apps/web/lib/tg/identity-link.ts`：

```ts
import { supabaseAdmin } from "./admin";

export type IdentityToAttach =
  | { kind: "email"; email: string }
  | { kind: "telegram"; tgId: number; username?: string }
  | { kind: "google" }
  | { kind: "apple" };

export type AttachResult = { ok: true } | { ok: false; error: "already_attached" | "taken" | "send_failed" };

/**
 * 绑定对称化（EP-account2-04）。此前 link-email/link-telegram 两条路由各带各的
 * 鉴权前提（"绑你没用来登录的那个"），把系统锁死在双身份世界——接 Google/Apple
 * 时会演化成 link-google/link-apple 四条各自为政的路由。
 *
 * 新规则：任何有效会话都可以绑定本账号尚未拥有的身份类型。email/google/apple
 * 委托 Supabase 原生身份系统；telegram 是唯一必须自定义的分支（非 Supabase
 * 原生 provider）。google/apple 本轮只留接缝，真正调用时抛错——不是悄悄什么都
 * 不做，是明确告诉调用方"这条还没接"（spec §8：本轮不接 OAuth 实装）。
 */
export async function attachIdentity(uid: string, identity: IdentityToAttach): Promise<AttachResult> {
  const sb = supabaseAdmin();

  if (identity.kind === "email") {
    const { data: list } = await sb.auth.admin.listUsers();
    const taken = list.users.some(
      (u) => u.email?.toLowerCase() === identity.email.toLowerCase() && u.id !== uid,
    );
    if (taken) return { ok: false, error: "taken" };

    const { error: updateError } = await sb.auth.admin.updateUserById(uid, { email: identity.email });
    if (updateError) return { ok: false, error: "send_failed" };

    const { error: linkError } = await sb.auth.admin.generateLink({ type: "magiclink", email: identity.email });
    if (linkError) return { ok: false, error: "send_failed" };

    return { ok: true };
  }

  if (identity.kind === "telegram") {
    const { data: existing } = await sb
      .from("tg_users")
      .select("supabase_user_id")
      .eq("tg_user_id", identity.tgId)
      .maybeSingle();

    if (!existing) {
      const { error } = await sb.from("tg_users").insert({
        tg_user_id: identity.tgId,
        supabase_user_id: uid,
        username: identity.username ?? null,
      });
      if (error) return { ok: false, error: "send_failed" };
      return { ok: true };
    }

    if (existing.supabase_user_id === uid) return { ok: true }; // 已绑给自己：幂等

    return { ok: false, error: "already_attached" };
  }

  // google / apple：本轮只留接缝，不实装（spec §8）。
  throw new Error(`attachIdentity: provider "${identity.kind}" 未实装`);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- lib/tg/__tests__/identity-link.test.ts`
Expected: 7 个用例 PASS。

- [ ] **Step 5: 写路由测试（失败）**

创建 `apps/web/app/api/account/attach/__tests__/route.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveUidMock = vi.fn();
const attachIdentityMock = vi.fn();
vi.mock("@/lib/account/uid", () => ({ resolveUid: (...a: unknown[]) => resolveUidMock(...a) }));
vi.mock("@/lib/tg/identity-link", () => ({ attachIdentity: (...a: unknown[]) => attachIdentityMock(...a) }));
const verifyTelegramLoginMock = vi.fn(() => ({ ok: true, id: 999, username: "bob" }));
vi.mock("@eamvp/core", () => ({ verifyTelegramLogin: (...a: unknown[]) => verifyTelegramLoginMock(...a) }));

const { POST } = await import("../route");

function req(body: unknown): Request {
  return new Request("http://x/api/account/attach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveUidMock.mockResolvedValue({ uid: "u1", via: "web", needsRefresh: false });
  attachIdentityMock.mockResolvedValue({ ok: true });
});

describe("POST /api/account/attach", () => {
  it("未登录 → 401，不调用 attachIdentity", async () => {
    resolveUidMock.mockResolvedValue(null);
    const res = await POST(req({ kind: "email", email: "a@x.com" }));
    expect(res.status).toBe(401);
    expect(attachIdentityMock).not.toHaveBeenCalled();
  });

  it("kind=email：合法邮箱 → 200，attachIdentity 收到 {kind:'email', email}", async () => {
    const res = await POST(req({ kind: "email", email: "a@x.com" }));
    expect(res.status).toBe(200);
    expect(attachIdentityMock).toHaveBeenCalledWith("u1", { kind: "email", email: "a@x.com" });
  });

  it("kind=email：非法邮箱格式 → 400，不调用 attachIdentity", async () => {
    const res = await POST(req({ kind: "email", email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(attachIdentityMock).not.toHaveBeenCalled();
  });

  it("kind=email：attachIdentity 返回 taken → 409", async () => {
    attachIdentityMock.mockResolvedValue({ ok: false, error: "taken" });
    const res = await POST(req({ kind: "email", email: "a@x.com" }));
    expect(res.status).toBe(409);
  });

  it("kind=telegram：verifyTelegramLogin 通过 → attachIdentity 收到解析出的 tgId/username", async () => {
    const res = await POST(req({ kind: "telegram", id: 999, username: "bob", auth_date: 1, hash: "h" }));
    expect(res.status).toBe(200);
    expect(attachIdentityMock).toHaveBeenCalledWith("u1", { kind: "telegram", tgId: 999, username: "bob" });
  });

  it("kind=telegram：verifyTelegramLogin 失败 → 401，不调用 attachIdentity", async () => {
    verifyTelegramLoginMock.mockReturnValue({ ok: false, error: "bad hash" });
    const res = await POST(req({ kind: "telegram", id: 999, auth_date: 1, hash: "bad" }));
    expect(res.status).toBe(401);
    expect(attachIdentityMock).not.toHaveBeenCalled();
  });

  it("kind=telegram：attachIdentity 返回 already_attached → 409", async () => {
    attachIdentityMock.mockResolvedValue({ ok: false, error: "already_attached" });
    const res = await POST(req({ kind: "telegram", id: 999, auth_date: 1, hash: "h" }));
    expect(res.status).toBe(409);
  });

  it("kind 缺失或未知 → 400", async () => {
    const res = await POST(req({ kind: "bogus" }));
    expect(res.status).toBe(400);
    expect(attachIdentityMock).not.toHaveBeenCalled();
  });

  it("任何 kind 下 via 不再是「必须对应」的前提——TG 会话也能绑邮箱、web 会话也能绑 TG（对称化的核心断言）", async () => {
    resolveUidMock.mockResolvedValue({ uid: "u1", via: "tg", needsRefresh: false });
    const res1 = await POST(req({ kind: "email", email: "a@x.com" }));
    expect(res1.status).toBe(200);

    resolveUidMock.mockResolvedValue({ uid: "u1", via: "web", needsRefresh: false });
    const res2 = await POST(req({ kind: "telegram", id: 999, auth_date: 1, hash: "h" }));
    expect(res2.status).toBe(200);
  });
});
```

- [ ] **Step 6: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- app/api/account/attach`
Expected: FAIL——路由不存在。

- [ ] **Step 7: 实现路由**

创建 `apps/web/app/api/account/attach/route.ts`：

```ts
import { NextResponse } from "next/server";
import { verifyTelegramLogin, type TgLoginParams } from "@eamvp/core";
import { resolveUid } from "@/lib/account/uid";
import { attachIdentity } from "@/lib/tg/identity-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST /api/account/attach —— 对称化的身份绑定入口（EP-account2-04），取代
 * 此前各带各鉴权前提的 link-email/link-telegram。任何有效会话（TG 或 web）
 * 都可以绑定本账号尚未拥有的身份类型；不再要求「必须是没用来登录的那个」。
 */
export async function POST(req: Request): Promise<Response> {
  const who = await resolveUid(req);
  if (!who) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { kind?: unknown } & Record<string, unknown>;

  if (body.kind === "email") {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    const r = await attachIdentity(who.uid, { kind: "email", email });
    if (!r.ok) {
      const status = r.error === "taken" ? 409 : 500;
      return NextResponse.json({ error: r.error }, { status });
    }
    return NextResponse.json({ ok: true, pending: true });
  }

  if (body.kind === "telegram") {
    const v = verifyTelegramLogin(body as unknown as TgLoginParams, process.env.TELEGRAM_BOT_TOKEN!);
    if (!v.ok) {
      return NextResponse.json({ error: v.error }, { status: 401 });
    }
    const r = await attachIdentity(who.uid, { kind: "telegram", tgId: v.id, username: v.username });
    if (!r.ok) {
      const status = r.error === "already_attached" ? 409 : 500;
      return NextResponse.json({ error: r.error }, { status });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_kind" }, { status: 400 });
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- app/api/account/attach`
Expected: 9 个用例 PASS。

- [ ] **Step 9: 删除旧路由，切换 `/account` 页面的调用点**

```bash
rm apps/web/app/api/account/link-email/route.ts
rm apps/web/app/api/account/link-telegram/route.ts
```

修改 `apps/web/app/account/page.tsx`——找到 `handleLinkEmail` 内的 fetch 调用：

```diff
       const res = await fetch("/api/account/link-email", {
         method: "POST",
         credentials: "include",
         headers: { "content-type": "application/json" },
-        body: JSON.stringify({ email }),
+        body: JSON.stringify({ kind: "email", email }),
       });
```

以及 `window.onTelegramLink` 里的 fetch 调用：

```diff
         const res = await fetch("/api/account/link-telegram", {
           method: "POST",
           credentials: "include",
           headers,
-          body: JSON.stringify(u),
+          body: JSON.stringify({ kind: "telegram", ...u }),
         });
```

- [ ] **Step 10: 跑 `/account` 既有测试确认零回归**

Run: `pnpm --filter @eamvp/web test -- app/account`
Expected: Task 3 新增的用例与其余既有用例全部 PASS（这两处只是 body 形状变了，行为不变）。

- [ ] **Step 11: 全量回归**

Run: `pnpm typecheck && pnpm --filter @eamvp/web test`
Expected: 全绿。

- [ ] **Step 12: 提交**

```bash
git add apps/web/lib/tg/identity-link.ts apps/web/lib/tg/__tests__/identity-link.test.ts \
  apps/web/app/api/account/attach apps/web/app/account/page.tsx
git rm apps/web/app/api/account/link-email/route.ts apps/web/app/api/account/link-telegram/route.ts
git commit -m "[EP-account2-04] attachIdentity 对称化，取代 link-email/link-telegram 两条不对称路由"
```

---

## Task 5: LLM 闸门——堵住静默放行漏洞 + 付费门槛校验函数

**Files:**
- Modify: `apps/web/app/api/spirit/chat/route.ts`
- Create: `apps/web/app/api/spirit/chat/__tests__/route.test.ts`
- Modify: `apps/web/app/api/spirit/dream/route.ts`
- Modify: `apps/web/app/api/spirit/dream/__tests__/route.test.ts`（追加用例）
- Create: `apps/web/lib/billing-gate.ts`
- Create: `apps/web/lib/billing-gate.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `resolveAccess`
- Produces: `requireVerifiedEmailForPayment(uid: string): Promise<{ ok: true } | { ok: false; reason: "not_identified" | "no_verified_email" }>`——未来 `/api/billing/checkout`（T5/T6，billing spec）调用这个函数做发起支付前的校验，本轮不接实际路由。

- [ ] **Step 1: 写失败测试——`api/spirit/chat` 未识别身份必须拒绝**

创建 `apps/web/app/api/spirit/chat/__tests__/route.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({ supabaseAdmin: () => ({ auth: { getUser: (...a: unknown[]) => getUserMock(...a) } }) }));

const resolveAccessMock = vi.fn();
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));

const consumeLlmMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/entitlements", () => ({ consumeLlm: (...a: unknown[]) => consumeLlmMock(...a) }));

const isLlmConfiguredMock = vi.fn(() => true);
const generateSpiritIntroSpy = vi.fn(async () => ({ text: "你好", model: "m" }));
const streamSpiritChatSpy = vi.fn(async function* () {
  yield "回复";
});
vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "minimax", model: "m" })),
  isLlmConfigured: () => isLlmConfiguredMock(),
  generateSpiritIntro: (...a: unknown[]) => generateSpiritIntroSpy(...a),
  streamSpiritChat: (...a: unknown[]) => streamSpiritChatSpy(...(a as [])),
}));
vi.mock("@/lib/i18n/server", () => ({ localeFromRequest: () => "zh" }));

const { POST } = await import("../route");

function req(body: unknown, authorization?: string): Request {
  return new Request("http://x/api/spirit/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isLlmConfiguredMock.mockReturnValue(true);
  consumeLlmMock.mockResolvedValue({ ok: true });
  resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
});

describe("POST /api/spirit/chat：未识别身份必须拒绝，不得静默放行（EP-account2-05）", () => {
  it("无 Authorization header、有真实用户消息 → 401，且不调用 consumeLlm/streamSpiritChat（锁死原 if(userId) 漏洞）", async () => {
    const res = await POST(req({ chart: {}, messages: [{ role: "user", content: "嗨" }] }));
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expect(streamSpiritChatSpy).not.toHaveBeenCalled();
  });

  it("有 Bearer 但 getUser 解析不出用户 → 401，不放行", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ chart: {}, messages: [{ role: "user", content: "嗨" }] }, "Bearer bad-token"));
    expect(res.status).toBe(401);
    expect(streamSpiritChatSpy).not.toHaveBeenCalled();
  });

  it("有 Bearer、能解析出 uid，但 resolveAccess 判定为 anonymous → 401（裸 uid 不等于已识别）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
    const res = await POST(req({ chart: {}, messages: [{ role: "user", content: "嗨" }] }, "Bearer tok"));
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
  });

  it("有 Bearer、resolveAccess 判定为 identified → 正常走 consumeLlm + streamSpiritChat", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(req({ chart: {}, messages: [{ role: "user", content: "嗨" }] }, "Bearer tok"));
    expect(res.status).toBe(200);
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
    expect(streamSpiritChatSpy).toHaveBeenCalled();
  });

  it("开场白（无用户消息）不受此闸门约束——不识别身份也能拿开场白，不消耗额度（既有行为不变）", async () => {
    const res = await POST(req({ chart: {}, messages: [] }));
    expect(res.status).toBe(200);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expect(generateSpiritIntroSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- app/api/spirit/chat`
Expected: FAIL——现有代码 `if (!isIntro && userId)`，第 1/2/3 条用例会因为闸门被跳过而返回 200。

- [ ] **Step 3: 实现**

修改 `apps/web/app/api/spirit/chat/route.ts`：

```diff
 import { resolveLlmConfig, isLlmConfigured, generateSpiritIntro, streamSpiritChat } from "@eamvp/llm";
 import type { UnifiedChart } from "@eamvp/core";
 import { supabaseAdmin } from "@/lib/tg/admin";
 import { consumeLlm } from "@/lib/entitlements";
+import { resolveAccess } from "@/lib/access";
 import { localeFromRequest } from "@/lib/i18n/server";
```

```diff
   const authHeader = req.headers.get("authorization");
   let userId: string | undefined;
   if (authHeader?.startsWith("Bearer ")) {
     const token = authHeader.slice(7);
     const { data } = await supabaseAdmin().auth.getUser(token);
     userId = data.user?.id;
   }
 
-  // 开场白（无用户消息）不消耗额度；有用户消息时执行统一 LLM 额度闸门
+  // 开场白（无用户消息）不消耗额度，也不要求已识别身份——这个分支本来就
+  // 不发起真正的对话。有用户消息时，必须解析出「已识别」身份才放行
+  // （EP-account2-05）：此前是 `if (!isIntro && userId)`，userId 为
+  // undefined（未带 token）时闸门被整个跳过，等于无限免费；现在改成
+  // 「解析不出已识别身份就拒绝」，fail-safe 而不是 fail-open。
   const isIntro = !messages.some((m) => m.role === "user");
-  if (!isIntro && userId) {
-    const gate = await consumeLlm(userId);
-    if (!gate.ok) {
-      return new Response(JSON.stringify({ error: "paywall" }), { status: 402, headers: { "content-type": "application/json" } });
-    }
-  }
+  if (!isIntro) {
+    if (!userId) {
+      return new Response("未登录", { status: 401 });
+    }
+    const access = await resolveAccess(userId);
+    if (access.level === "anonymous") {
+      return new Response("未登录", { status: 401 });
+    }
+    const gate = await consumeLlm(userId);
+    if (!gate.ok) {
+      return new Response(JSON.stringify({ error: "paywall" }), { status: 402, headers: { "content-type": "application/json" } });
+    }
+  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- app/api/spirit/chat`
Expected: 5 个用例 PASS。

- [ ] **Step 5: 同样的漏洞修 `api/spirit/dream`（写失败测试，追加进既有文件）**

在 `apps/web/app/api/spirit/dream/__tests__/route.test.ts` 顶部的 mock 区块里追加（若已有 `vi.mock("@/lib/access", ...)` 则跳过重复）：

```ts
const resolveAccessMock = vi.fn(async () => ({ level: "identified" as const, hasVerifiedEmail: false, hasTelegram: true }));
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));
```

并在 `beforeEach` 里补一行 `resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });`（若这个文件的 `beforeEach` 已经 `vi.clearAllMocks()`，mock 的默认实现会被保留但调用记录清空，仍需要在每个 `beforeEach` 里重新 `mockResolvedValue` 一次，防止上一条用例的 `mockResolvedValueOnce` 残留影响下一条）。

追加用例：

```ts
describe("EP-account2-05：/api/spirit/dream 同一处闸门漏洞", () => {
  it("无 Authorization → 401，不调用 interpretDream（此前 if(userId) 会静默放行）", async () => {
    const res = await POST(req({ chart: { fake: true }, dream: "我梦见坠落" }));
    expect(res.status).toBe(401);
  });

  it("有 Bearer 但 resolveAccess 判定 anonymous → 401", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
    const res = await POST(req({ chart: { fake: true }, dream: "我梦见坠落" }, "Bearer tok"));
    expect(res.status).toBe(401);
  });
});
```

（`req()` helper 与既有测试共用；若既有 helper 不支持传第二个 `authorization` 参数，按 Task 5 Step 1 里 `api/spirit/chat` 测试的 `req()` 写法调整签名，保持既有调用点兼容。）

- [ ] **Step 6: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- app/api/spirit/dream`
Expected: 新增两条 FAIL，既有用例不受影响。

- [ ] **Step 7: 实现**

修改 `apps/web/app/api/spirit/dream/route.ts`：

```diff
 import { resolveLlmConfig, isLlmConfigured, interpretDream, DREAM_MAX_CHARS } from "@eamvp/llm";
 import type { UnifiedChart } from "@eamvp/core";
 import { supabaseAdmin } from "@/lib/tg/admin";
 import { consumeLlm } from "@/lib/entitlements";
+import { resolveAccess } from "@/lib/access";
 import { localeFromRequest } from "@/lib/i18n/server";
```

```diff
   const authHeader = req.headers.get("authorization");
   let userId: string | undefined;
   if (authHeader?.startsWith("Bearer ")) {
     const { data } = await supabaseAdmin().auth.getUser(authHeader.slice(7));
     userId = data.user?.id;
   }
-  if (userId) {
-    const gate = await consumeLlm(userId);
-    if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });
-  }
+  // EP-account2-05：与 api/spirit/chat 同一处漏洞（原 `if (userId)` 未带 token
+  // 时静默跳过闸门）。解梦没有开场白分支，任何一次调用都必须已识别身份。
+  if (!userId) {
+    return new Response("未登录", { status: 401 });
+  }
+  const access = await resolveAccess(userId);
+  if (access.level === "anonymous") {
+    return new Response("未登录", { status: 401 });
+  }
+  const gate = await consumeLlm(userId);
+  if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });
```

- [ ] **Step 8: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- app/api/spirit/dream`
Expected: 全部 PASS。

- [ ] **Step 9: 付费门槛校验函数（写失败测试）**

创建 `apps/web/lib/billing-gate.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveAccessMock = vi.fn();
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));

const { requireVerifiedEmailForPayment } = await import("./billing-gate");

beforeEach(() => vi.clearAllMocks());

describe("requireVerifiedEmailForPayment（EP-account2-05，供未来 checkout 路由调用）", () => {
  it("anonymous → not_identified", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: false, reason: "not_identified" });
  });

  it("identified 但只有 TG、没有已验证邮箱 → no_verified_email（即使影子邮箱还带着 email_confirm=true，hasVerifiedEmail 也已经在 resolveAccess 里排除掉了）", async () => {
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: false, reason: "no_verified_email" });
  });

  it("identified 且 hasVerifiedEmail → ok", async () => {
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true, hasTelegram: false });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: true });
  });

  it("已经是 member（自然蕴含 hasVerifiedEmail，见 resolveAccess 定义）→ ok", async () => {
    resolveAccessMock.mockResolvedValue({ level: "member", hasVerifiedEmail: true, hasTelegram: true });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: true });
  });
});
```

- [ ] **Step 10: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- lib/billing-gate.test.ts`
Expected: FAIL——模块不存在。

- [ ] **Step 11: 实现**

创建 `apps/web/lib/billing-gate.ts`：

```ts
import { resolveAccess } from "@/lib/access";

export type PaymentGateResult = { ok: true } | { ok: false; reason: "not_identified" | "no_verified_email" };

/**
 * 发起支付前的校验（EP-account2-05，spec §5）。本轮不接支付本体
 * （Stripe/TG Stars 卡凭据，见 billing spec T5/T6），这个函数是给未来
 * checkout 路由用的闸门——卡在**发起支付前**，不在回调后：回调时款已收讫，
 * 再拒绝就成了退款问题。
 *
 * 调用方（未来）：
 *   web  `/api/billing/checkout`：校验不过时返回特定错误码，Paywall
 *        就地展开「绑定邮箱」而不是把用户踢走。
 *   TG   bot 发 invoice 前同一道校验。
 */
export async function requireVerifiedEmailForPayment(uid: string): Promise<PaymentGateResult> {
  const access = await resolveAccess(uid);
  if (access.level === "anonymous") return { ok: false, reason: "not_identified" };
  if (!access.hasVerifiedEmail) return { ok: false, reason: "no_verified_email" };
  return { ok: true };
}
```

- [ ] **Step 12: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- lib/billing-gate.test.ts`
Expected: 4 个用例 PASS。

- [ ] **Step 13: 全量回归**

Run: `pnpm typecheck && pnpm --filter @eamvp/web test`
Expected: 全绿。

- [ ] **Step 14: 提交**

```bash
git add apps/web/app/api/spirit/chat apps/web/app/api/spirit/dream/route.ts \
  apps/web/app/api/spirit/dream/__tests__/route.test.ts \
  apps/web/lib/billing-gate.ts apps/web/lib/billing-gate.test.ts
git commit -m "[EP-account2-05] 堵住 spirit/chat 与 spirit/dream 的 LLM 闸门静默放行漏洞 + 付费门槛校验函数"
```

---

## Task 6: 匿名档案归属迁移事务化

**Files:**
- Create: `supabase/migrations/0012_merge_anon_profiles_rpc.sql`

  **⚠️ 文件编号提醒**：Task 7 也会创建编号为 `0012`/`0013` 的迁移——落地时按实际实施顺序重新编号，避免两个任务各自占用同一个号。若 Task 6 先做，本文件是 `0012`，Task 7 的两个文件顺延为 `0013`/`0014`；反之亦然。哪个任务先完成迁移文件的编号就先占，后完成的任务在自己的 Step 里临时调整文件名与内容里的注释编号即可，不影响 SQL 本身。

- Modify: `apps/web/lib/tg/merge.ts`
- Create: `apps/web/lib/tg/__tests__/merge.test.ts`

**Interfaces:**
- Consumes: 无（独立任务）
- Produces: RPC `merge_anon_profiles(p_anon_id uuid, p_target_id uuid) returns int`（返回迁移的 profiles 行数）；`mergeAnonProfiles(anonAccessToken, targetUserId)` 签名不变，内部改为单次事务性调用。

- [ ] **Step 1: 写迁移 SQL**

创建 `supabase/migrations/0012_merge_anon_profiles_rpc.sql`：

```sql
-- EP-account2-06 · 匿名档案归属迁移改事务化
-- 此前 mergeAnonProfiles() 是两次独立 update（profiles 一次、spirit_messages
-- 一次），非事务——如果第一次成功、第二次失败（网络抖动/RLS/约束冲突），
-- 用户会永久卡在「档案已经转移但对话记录没转移」的半迁移状态,且没有重试
-- 机制能安全地重新跑一遍（重跑会把已经迁移过的行再跑一次 update，语义上
-- 是幂等的，但两张表分开跑仍然存在「跑了一半进程被杀」的窗口）。
--
-- 改成 security definer 的单事务 RPC：两张表的 update 在同一个事务里，
-- 要么都成功要么都不生效；调用方即使重复调用同一对 (anon_id, target_id)
-- 也是安全的（第二次调用时两张表都已经没有 user_id = anon_id 的行了，
-- update 影响 0 行，返回 0，不是错误）。

create or replace function public.merge_anon_profiles(p_anon_id uuid, p_target_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_merged int;
begin
  if p_anon_id = p_target_id then
    return 0;
  end if;

  update public.profiles
    set user_id = p_target_id
    where user_id = p_anon_id;
  get diagnostics v_merged = row_count;

  update public.spirit_messages
    set user_id = p_target_id
    where user_id = p_anon_id;

  return v_merged;
end;
$$;
```

- [ ] **Step 2: 写失败测试——`mergeAnonProfiles` 改调 RPC**

创建 `apps/web/lib/tg/__tests__/merge.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: { getUser: (...a: unknown[]) => getUserMock(...a) },
    rpc: (...a: unknown[]) => rpcMock(...a),
  }),
}));

const { mergeAnonProfiles } = await import("../merge");

beforeEach(() => vi.clearAllMocks());

describe("mergeAnonProfiles：改调单事务 RPC（EP-account2-06）", () => {
  it("匿名用户存在且不是目标账号 → 调 RPC merge_anon_profiles，返回其迁移行数", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "anon1", is_anonymous: true } } });
    rpcMock.mockResolvedValue({ data: 3, error: null });
    const r = await mergeAnonProfiles("anon-token", "target1");
    expect(rpcMock).toHaveBeenCalledWith("merge_anon_profiles", { p_anon_id: "anon1", p_target_id: "target1" });
    expect(r).toEqual({ merged: 3 });
  });

  it("token 解析不出用户 → merged: 0，不调 RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const r = await mergeAnonProfiles("bad-token", "target1");
    expect(r).toEqual({ merged: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("解析出的用户不是匿名用户 → merged: 0，不调 RPC（防止误把已登录用户的档案转走）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", is_anonymous: false } } });
    const r = await mergeAnonProfiles("token", "target1");
    expect(r).toEqual({ merged: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("匿名用户 id 与目标账号相同 → merged: 0，不调 RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "same", is_anonymous: true } } });
    const r = await mergeAnonProfiles("token", "same");
    expect(r).toEqual({ merged: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RPC 返回 error → merged: 0（不抛错，调用方是「尽力而为」的合并，失败不阻断登录流程）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "anon1", is_anonymous: true } } });
    rpcMock.mockResolvedValue({ data: null, error: { message: "db error" } });
    const r = await mergeAnonProfiles("token", "target1");
    expect(r).toEqual({ merged: 0 });
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- lib/tg/__tests__/merge.test.ts`
Expected: FAIL——现有实现调用的是两次独立 `.from(...).update(...)`，不调用 `rpc()`。

- [ ] **Step 4: 实现**

修改 `apps/web/lib/tg/merge.ts`（整个文件替换为）：

```ts
import { supabaseAdmin } from "./admin";

/**
 * 匿名用户排的盘迁到已识别账号名下（EP-account2-06）。改为单事务 RPC
 * （见 supabase/migrations/0012_merge_anon_profiles_rpc.sql）——此前是两次
 * 独立 update，半迁移会让用户永久丢一半数据。RPC 天然幂等：重复调用同一对
 * (anon_id, target_id) 不会出错，只是第二次影响 0 行。
 */
export async function mergeAnonProfiles(
  anonAccessToken: string,
  targetUserId: string,
): Promise<{ merged: number }> {
  const admin = supabaseAdmin();
  const { data: u } = await admin.auth.getUser(anonAccessToken);
  const anon = u?.user;
  if (!anon || anon.id === targetUserId || !anon.is_anonymous) {
    return { merged: 0 };
  }

  const { data, error } = await admin.rpc("merge_anon_profiles", {
    p_anon_id: anon.id,
    p_target_id: targetUserId,
  });
  if (error) {
    console.error("merge_anon_profiles rpc error", error);
    return { merged: 0 };
  }
  return { merged: (data as number | null) ?? 0 };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- lib/tg/__tests__/merge.test.ts`
Expected: 5 个用例 PASS。

- [ ] **Step 6: 全量回归**

Run: `pnpm typecheck && pnpm --filter @eamvp/web test`
Expected: 全绿（`api/auth/telegram/route.ts` 调用 `mergeAnonProfiles` 的调用点签名不变，零改动）。

- [ ] **Step 7: 提交**

```bash
git add supabase/migrations/0012_merge_anon_profiles_rpc.sql apps/web/lib/tg/merge.ts apps/web/lib/tg/__tests__/merge.test.ts
git commit -m "[EP-account2-06] 匿名档案归属迁移改单事务 RPC，杜绝半迁移"
```

---

## Task 7: 合规最小面——级联迁移 + 级联清单单测 + 条款接受记录

**Files:**
- Create: `supabase/migrations/00XX_profiles_cascade.sql`（按 Task 6 的编号提醒调整实际序号）
- Create: `supabase/migrations/00XX_user_consents.sql`
- Create: `apps/web/lib/__tests__/user-data-cascade.test.ts`
- Create: `apps/web/lib/consent.ts`
- Create: `apps/web/lib/__tests__/consent.test.ts`
- Modify: `apps/web/lib/tg/identity.ts`（`resolveOrCreateTgUser` 新用户分支调 `recordConsentOnce`；引用共享的 `SYNTHETIC_EMAIL_DOMAIN`）
- Modify: `apps/web/app/api/account/identities/route.ts`（`resolveAccess(uid).level !== "anonymous"` 时调 `recordConsentOnce`）

**Interfaces:**
- Consumes: Task 1 的 `resolveAccess`、`SYNTHETIC_EMAIL_DOMAIN`
- Produces: `recordConsentOnce(uid: string, document: string, version: string): Promise<void>`（幂等，失败静默吞掉，不阻断调用方主流程）

- [ ] **Step 1: `profiles` 级联迁移（幂等 SQL）**

创建 `supabase/migrations/00XX_profiles_cascade.sql`（文件名按实际序号命名，内容如下）：

```sql
-- EP-account2-07 · profiles.user_id → auth.users(id) 级联删除显式化（幂等）
-- profiles 建表迁移不在仓库内（迁移编号从 0002 起跳，早于迁移被跟踪），
-- 当前是否已有 cascade 约束无法从源码核实——注销账号时最核心的这张表的
-- 级联行为必须能从仓库里读出来，收钱产品上这点模糊不可接受。
--
-- 覆盖三种可能的现状：
--   1) 已存在 on delete cascade 约束 → 跳过，不重复添加
--   2) 存在但不是 cascade（比如默认的 no action）→ 先删旧约束，再建 cascade 版本
--   3) 完全没有 FK 约束 → 直接建 cascade 版本

do $$
declare
  r record;
  has_cascade boolean := false;
begin
  for r in
    select con.conname, con.confdeltype
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and con.conkey = (
        select array_agg(attnum order by attnum)
        from pg_attribute
        where attrelid = rel.oid and attname = 'user_id'
      )
  loop
    if r.confdeltype = 'c' then
      has_cascade := true;
    else
      execute format('alter table public.profiles drop constraint %I', r.conname);
    end if;
  end loop;

  if not has_cascade then
    alter table public.profiles
      add constraint profiles_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;
```

- [ ] **Step 2: `user_consents` 表迁移**

创建 `supabase/migrations/00XX_user_consents.sql`：

```sql
-- EP-account2-07 · 条款接受记录（合规最小面，spec §6②）
-- 记录点在身份建立那一刻（TG 首次创建 / 首次识别为非匿名），不在匿名浏览
-- 时——匿名浏览只是在看，还没有「关系」可言。带 version 列但不建版本管理
-- 机制（v1 最小面）：条款改版时插新行即可，不用改表结构。
-- 消息不可变——同 spirit_messages 的既有惯例，只给 select/insert 开策略。

create table if not exists public.user_consents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  document     text not null,
  version      text not null,
  accepted_at  timestamptz not null default now(),
  unique (user_id, document, version)
);

alter table public.user_consents enable row level security;
create policy own_select on public.user_consents for select using (auth.uid() = user_id);
create policy own_insert on public.user_consents for insert with check (auth.uid() = user_id);

create index if not exists user_consents_user_idx on public.user_consents(user_id, document);
```

- [ ] **Step 3: 写失败测试——级联清单（读迁移文件，不连库）**

创建 `apps/web/lib/__tests__/user-data-cascade.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 用户数据表清单——注销账号时必须级联清理的表（EP-account2-07，spec §6①）。
 * 每张表映射到"定义它的 cascade 约束"所在的迁移文件；测试直接读文件断言，
 * 不连库（这个仓库很多迁移只 apply 在生产、CI 环境里没有可连的库）。
 *
 * ⚠️ 这份清单需要人工维护：新增一张挂 auth.users 外键的用户数据表时，
 * 必须在这里加一行，这条测试才知道要检查它。这是清单类测试的天然限制——
 * 它防的是"清单里的表忘了配 cascade"，不是"忘了把新表加进清单"（后者要靠
 * code review）。
 */
const TABLE_TO_MIGRATION_FILE: Record<string, string> = {
  spirit_messages: "0002_spirit_messages.sql",
  tg_users: "0005_tg_users.sql",
  entitlements: "0009_entitlements.sql",
  llm_credit_account: "0010_llm_credit_account.sql",
  dwellings: "0011_dwellings.sql",
  fengshui_reports: "0011_dwellings.sql",
  profiles: "00XX_profiles_cascade.sql", // 按 Step 1 实际文件名改
  user_consents: "00XX_user_consents.sql", // 按 Step 2 实际文件名改
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");

describe("EP-account2-07：注销级联清单完整性（读迁移文件，不连库）", () => {
  it.each(Object.entries(TABLE_TO_MIGRATION_FILE))(
    "%s（%s）里同时出现 auth.users 与 on delete cascade",
    (_table, file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      expect(sql).toMatch(/auth\.users/i);
      expect(sql).toMatch(/on delete cascade/i);
    },
  );
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- lib/__tests__/user-data-cascade.test.ts`
Expected: FAIL——`00XX_profiles_cascade.sql`/`00XX_user_consents.sql` 这两个占位文件名在 Step 1/2 里还没按实际序号改过来（先完成 Step 1/2、把文件名改成真实序号、再回来同步这个清单里对应的字符串，然后才会 PASS）。

- [ ] **Step 5: 把 Step 1/2/3 的文件名对齐后跑通**

确认 `TABLE_TO_MIGRATION_FILE` 里 `profiles`/`user_consents` 两行的文件名字符串，与 Step 1/2 实际创建的迁移文件名完全一致。

Run: `pnpm --filter @eamvp/web test -- lib/__tests__/user-data-cascade.test.ts`
Expected: 8 个用例全部 PASS。

- [ ] **Step 6: `recordConsentOnce`（写失败测试）**

创建 `apps/web/lib/__tests__/consent.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ from: () => ({ insert: (...a: unknown[]) => insertMock(...a) }) }),
}));

const { recordConsentOnce } = await import("../consent");

beforeEach(() => vi.clearAllMocks());

describe("recordConsentOnce", () => {
  it("正常插入：带 user_id/document/version", async () => {
    insertMock.mockResolvedValue({ error: null });
    await recordConsentOnce("u1", "terms", "2026-08-20");
    expect(insertMock).toHaveBeenCalledWith(
      { user_id: "u1", document: "terms", version: "2026-08-20" },
      { count: undefined },
    );
  });

  it("重复调用（唯一约束冲突）不抛错——幂等，同一 (uid, document, version) 只留一条", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    await expect(recordConsentOnce("u1", "terms", "2026-08-20")).resolves.toBeUndefined();
  });

  it("其他数据库错误也不抛错——记录条款接受不该阻断调用方的主流程（best-effort）", async () => {
    insertMock.mockResolvedValue({ error: { code: "500", message: "db down" } });
    await expect(recordConsentOnce("u1", "terms", "2026-08-20")).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 7: 跑测试确认失败**

Run: `pnpm --filter @eamvp/web test -- lib/__tests__/consent.test.ts`
Expected: FAIL——模块不存在。

- [ ] **Step 8: 实现**

创建 `apps/web/lib/consent.ts`：

```ts
import { supabaseAdmin } from "@/lib/tg/admin";

/** 条款版本——改版时改这个常量即可，不用动表结构（spec §6②，v1 最小面）。 */
export const TERMS_VERSION = "2026-08-20";

/**
 * 记录一次条款接受（EP-account2-07）。幂等——`user_consents` 表在
 * (user_id, document, version) 上有唯一约束，重复调用只会撞唯一键冲突，
 * 不会插出第二条。best-effort：任何失败都吞掉，不抛错——记录条款接受
 * 不该阻断调用方（TG 建号 / 查看已绑定身份）的主流程。
 */
export async function recordConsentOnce(uid: string, document: string, version: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin()
      .from("user_consents")
      .insert({ user_id: uid, document, version }, { count: undefined });
    if (error && error.code !== "23505") {
      console.error("recordConsentOnce error", error);
    }
  } catch (e) {
    console.error("recordConsentOnce threw", e);
  }
}
```

- [ ] **Step 9: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- lib/__tests__/consent.test.ts`
Expected: 3 个用例 PASS。

- [ ] **Step 10: 接线——TG 新用户创建时记一次**

修改 `apps/web/lib/tg/identity.ts`：

```diff
 import { supabaseAdmin } from "./admin";
 import { getEntitlement, isMember } from "@/lib/entitlements";
+import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/access";
+import { recordConsentOnce, TERMS_VERSION } from "@/lib/consent";
 import type { BirthInput, UnifiedChart } from "@eamvp/core";
```

```diff
-  const { data: created, error } = await sb.auth.admin.createUser({ email: `tg_${tg.id}@zhaojian.local`, email_confirm: true });
+  const { data: created, error } = await sb.auth.admin.createUser({ email: `tg_${tg.id}@${SYNTHETIC_EMAIL_DOMAIN}`, email_confirm: true });
   if (error || !created.user) throw new Error("createUser 失败: " + (error?.message ?? ""));
   const uid = created.user.id;
   const { error: e2 } = await sb.from("tg_users").insert({ tg_user_id: tg.id, supabase_user_id: uid, tg_chat_id: chatId ?? null, username: tg.username ?? null, lang: tg.lang ?? "zh", ref: ref ?? null });
   if (e2) throw e2;
+  void recordConsentOnce(uid, "terms", TERMS_VERSION); // best-effort，不 await——不能因为条款记录失败而拖慢/搞砸 TG 建号
   return { supabaseUserId: uid };
```

（这一步 Task 8 还会再改这个函数的创建分支本身；这里只做常量替换和 consent 接线，不影响 Task 8 的改动范围。）

- [ ] **Step 11: 接线——`/api/account/identities` GET 侧记一次**

修改 `apps/web/app/api/account/identities/route.ts`：

```diff
 import { NextResponse } from "next/server";
 import { resolveUid } from "@/lib/account/uid";
 import { supabaseAdmin } from "@/lib/tg/admin";
-import { SYNTHETIC_EMAIL_DOMAIN } from "@/lib/access";
+import { SYNTHETIC_EMAIL_DOMAIN, resolveAccess } from "@/lib/access";
+import { recordConsentOnce, TERMS_VERSION } from "@/lib/consent";
```

```diff
   const { uid } = resolved;
 
+  const access = await resolveAccess(uid);
+  if (access.level !== "anonymous") {
+    void recordConsentOnce(uid, "terms", TERMS_VERSION); // best-effort，幂等，不 await
+  }
+
   const { data: u } = await supabaseAdmin().auth.admin.getUserById(uid);
```

- [ ] **Step 12: 补 `identities` 路由测试（此前零覆盖）**

创建 `apps/web/app/api/account/identities/__tests__/route.test.ts`：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveUidMock = vi.fn();
const resolveAccessMock = vi.fn();
const recordConsentOnceMock = vi.fn();
const getUserByIdMock = vi.fn();
const tgMaybeSingleMock = vi.fn();

vi.mock("@/lib/account/uid", () => ({ resolveUid: (...a: unknown[]) => resolveUidMock(...a) }));
vi.mock("@/lib/access", () => ({
  resolveAccess: (...a: unknown[]) => resolveAccessMock(...a),
  SYNTHETIC_EMAIL_DOMAIN: "zhaojian.local",
}));
vi.mock("@/lib/consent", () => ({
  recordConsentOnce: (...a: unknown[]) => recordConsentOnceMock(...a),
  TERMS_VERSION: "2026-08-20",
}));
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: { admin: { getUserById: (...a: unknown[]) => getUserByIdMock(...a) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => tgMaybeSingleMock() }) }) }),
  }),
}));

const { GET } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  resolveUidMock.mockResolvedValue({ uid: "u1", via: "tg", needsRefresh: false });
  resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
  getUserByIdMock.mockResolvedValue({ data: { user: { email: null } } });
  tgMaybeSingleMock.mockResolvedValue({ data: { username: "bob" } });
});

describe("GET /api/account/identities", () => {
  it("未登录 → 401，不查身份也不记录同意", async () => {
    resolveUidMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(401);
    expect(recordConsentOnceMock).not.toHaveBeenCalled();
  });

  it("已识别（非 anonymous）→ 记一次 consent（best-effort，不阻塞响应）", async () => {
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(200);
    expect(recordConsentOnceMock).toHaveBeenCalledWith("u1", "terms", "2026-08-20");
  });

  it("resolveAccess 判定 anonymous（理论上不该走到这——resolveUid 已经拿到 uid，但防御性覆盖）→ 不记录 consent", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
    await GET(new Request("http://x"));
    expect(recordConsentOnceMock).not.toHaveBeenCalled();
  });

  it("合成域名邮箱不返回给客户端（既有行为，回归锁定）", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { email: "tg_1@zhaojian.local" } } });
    const res = await GET(new Request("http://x"));
    const json = await res.json();
    expect(json.email).toBeNull();
  });
});
```

- [ ] **Step 13: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- app/api/account/identities`
Expected: 4 个用例 PASS。

- [ ] **Step 14: 全量回归**

Run: `pnpm typecheck && pnpm --filter @eamvp/web test && pnpm --filter @eamvp/core test`
Expected: 全绿。

- [ ] **Step 15: 提交**

```bash
git add supabase/migrations/00XX_profiles_cascade.sql supabase/migrations/00XX_user_consents.sql \
  apps/web/lib/__tests__/user-data-cascade.test.ts \
  apps/web/lib/consent.ts apps/web/lib/__tests__/consent.test.ts \
  apps/web/lib/tg/identity.ts apps/web/app/api/account/identities
git commit -m "[EP-account2-07] profiles 级联迁移可验证 + user_consents 表 + 条款接受记录接线"
```

---

## Task 8: TG 无邮箱用户创建 + CURRENT.md

**Files:**
- Modify: `apps/web/lib/tg/identity.ts`（`resolveOrCreateTgUser` 创建分支）
- Modify: `apps/web/lib/__tests__/`(对应测试，若 Task 7 未建则本任务补)
- Modify: `.agent/CURRENT.md`

**Interfaces:**
- Consumes: Task 1 的 `resolveAccess`/`SYNTHETIC_EMAIL_DOMAIN`（已在 Task 7 接好）
- Produces: `resolveOrCreateTgUser` 的创建分支行为按 Step 1 的真实实测结果二选一实现（不允许凭记忆写死，spec §9①）

- [ ] **Step 1: 真实环境实测——`auth.admin.createUser({})` 不带 email 能否建用户**

这一步**必须在真实 Supabase 项目上跑**，不能用本地 mock 猜测结果。用项目现有的 `service_role` key（`.env.local` 或部署环境变量里的 `SUPABASE_SERVICE_ROLE_KEY`）写一次性脚本：

```ts
// 临时脚本，跑完即删，不进正式代码——EP-account2-08 Step 1 实测
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const r = await sb.auth.admin.createUser({});
console.log(JSON.stringify(r, null, 2));
if (r.data.user) {
  // 清理刚创建的测试用户，不要在生产库里留垃圾数据
  await sb.auth.admin.deleteUser(r.data.user.id);
  console.log("test user cleaned up");
}
```

Run: `npx tsx scripts/probe-create-user-no-email.ts`（脚本路径任意，跑完删掉这个临时文件）

记录实测结果——两种可能之一：
- **成功**（返回 `user.email === null` 或未定义，无 error）→ 走 Step 2a。
- **失败**（Supabase 要求必须有 email 或 phone 才能创建用户，返回 error）→ 走 Step 2b。

把实测的原始输出（Supabase 版本、错误信息或成功时的 `user` 对象结构）粘进本任务的实现说明/commit message 里——这是 spec §9 明确要求"不得凭记忆写死"的两条前提之一，必须留痕。

- [ ] **Step 2a（若 Step 1 实测成功）：TG 新用户不再要合成邮箱**

修改 `apps/web/lib/tg/identity.ts` 的创建分支：

```diff
-  const { data: created, error } = await sb.auth.admin.createUser({ email: `tg_${tg.id}@${SYNTHETIC_EMAIL_DOMAIN}`, email_confirm: true });
+  // 实测确认（见本任务实现说明）：auth.admin.createUser({}) 不带 email 可以成功建用户。
+  // TG 首次进入不再需要合成邮箱——「有没有真邮箱」从此是个诚实事实，不用再靠
+  // resolveAccess 排除合成域名这层安全网（那层逻辑仍然保留：万一未来又有代码
+  // 路径手滑传了合成邮箱，hasVerifiedEmail 依然正确排除它，双重保险）。
+  const { data: created, error } = await sb.auth.admin.createUser({});
   if (error || !created.user) throw new Error("createUser 失败: " + (error?.message ?? ""));
```

- [ ] **Step 2b（若 Step 1 实测失败）：保留合成邮箱，写清楚为什么**

修改 `apps/web/lib/tg/identity.ts` 的创建分支（保持 Task 7 Step 10 已经做的常量替换不变，只加注释）：

```diff
+  // 实测确认（见本任务实现说明）：auth.admin.createUser({}) 不带 email 会失败——
+  // Supabase 要求必须有 email 或 phone 才能建用户。只能保留合成邮箱这条路，
+  // 但 resolveAccess 的 hasVerifiedEmail 判定已经显式排除这个域名（Task 1），
+  // 「已验证邮箱」这个信号依然诚实——不依赖「影子邮箱已被消灭」这个假设，
+  // 这正是 spec §3 要求判定函数「两种情况都正确」的意思。
   const { data: created, error } = await sb.auth.admin.createUser({ email: `tg_${tg.id}@${SYNTHETIC_EMAIL_DOMAIN}`, email_confirm: true });
```

- [ ] **Step 3: 按实测结果调整/新增测试**

若走 Step 2a：`apps/web/lib/tg/__tests__/identity.test.ts`（若不存在则创建）需要断言 `sb.auth.admin.createUser` 被调用时不带 `email` 字段：

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const createUserMock = vi.fn();
const tgInsertMock = vi.fn();
const tgSelectMaybeSingleMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: { admin: { createUser: (...a: unknown[]) => createUserMock(...a) } },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => tgSelectMaybeSingleMock() }) }),
      insert: (...a: unknown[]) => tgInsertMock(...a),
      update: () => ({ eq: () => ({}) }),
    }),
  }),
}));
vi.mock("@/lib/consent", () => ({ recordConsentOnce: vi.fn(), TERMS_VERSION: "2026-08-20" }));
vi.mock("@/lib/entitlements", () => ({ getEntitlement: vi.fn(), isMember: vi.fn(() => false) }));

const { resolveOrCreateTgUser } = await import("../identity");

beforeEach(() => {
  vi.clearAllMocks();
  tgSelectMaybeSingleMock.mockResolvedValue({ data: null });
  tgInsertMock.mockResolvedValue({ error: null });
});

describe("resolveOrCreateTgUser：新用户创建不带合成邮箱（EP-account2-08，实测分支 2a）", () => {
  it("createUser 调用参数里没有 email 字段", async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await resolveOrCreateTgUser({ id: 999 });
    const args = createUserMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(args).not.toHaveProperty("email");
  });
});
```

若走 Step 2b：断言 `createUser` 调用参数里的 `email` 精确等于 `tg_${id}@zhaojian.local`（用 `SYNTHETIC_EMAIL_DOMAIN` 常量拼，不要在测试里再写一遍字面量域名字符串）：

```ts
describe("resolveOrCreateTgUser：合成邮箱域名与 SYNTHETIC_EMAIL_DOMAIN 一致（EP-account2-08，实测分支 2b）", () => {
  it("createUser 的 email 用的是共享常量拼出来的域名，不是散落的字面量", async () => {
    const { SYNTHETIC_EMAIL_DOMAIN } = await import("@/lib/access");
    createUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await resolveOrCreateTgUser({ id: 999 });
    const args = createUserMock.mock.calls[0]![0] as { email: string };
    expect(args.email).toBe(`tg_999@${SYNTHETIC_EMAIL_DOMAIN}`);
  });
});
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @eamvp/web test -- lib/tg/__tests__/identity.test.ts`
Expected: PASS（对应实测分支的那一组用例）。

- [ ] **Step 5: 全量回归（含 typecheck / lint / build）**

Run: `pnpm typecheck && pnpm --filter @eamvp/core test && pnpm --filter @eamvp/web test && pnpm --filter @eamvp/web lint`
Expected: 全绿，0 errors，lint 0 errors（既有 18 条 warning 不增不减——若增加了新 warning，逐条核实是否本计划引入，是则修掉，不是则不用管）。

Run: `TELEGRAM_BOT_TOKEN=ci-placeholder-not-a-secret pnpm --filter @eamvp/web build`
Expected: 构建成功。

- [ ] **Step 6: 更新 `.agent/CURRENT.md`**

在版本历史表格末尾追加一行（日期用实际完成日期）：

```markdown
| 🔐 账号体系重建 | <实际日期> | EP-account2(spec `2026-08-20-account-system-redesign-design.md`)：诚实化「已验证邮箱」信号（`resolveAccess` 三层访问语义 + 排除合成域名）；会话 TTL 单一常量(30天+滑动续期)收敛 exp/cookie maxAge 三处硬编码；`resolveUid` 去 `next/headers` 依赖，收敛 3 份重复 cookie 解析；`/account` 真正消费会话确认结果；`attachIdentity` 对称化取代 link-email/link-telegram；堵住 `spirit/chat`+`spirit/dream` 的 LLM 闸门静默放行漏洞（`if(userId)`→无限免费）；匿名档案迁移改单事务 RPC；`profiles` 级联迁移可验证 + `user_consents` 条款记录；TG 建号 <实测结论：不再要合成邮箱｜仍需合成邮箱，域名单一事实源>。鉴权面此前**零测试**，本轮补齐。web<N>/core<N> 绿，typecheck 0，lint 0 errors，全部关键改动变异实证。⚠️ `0012_merge_anon_profiles_rpc.sql`/`00XX_profiles_cascade.sql`/`00XX_user_consents.sql` 待 apply 生产。 |
```

（`<N>` 按 Step 5 实际测试计数填；`<实测结论>` 按 Step 1 的真实结果二选一。）

- [ ] **Step 7: 提交**

```bash
git add apps/web/lib/tg/identity.ts apps/web/lib/tg/__tests__/identity.test.ts .agent/CURRENT.md
git commit -m "[EP-account2-08] TG 建号邮箱策略（按实测结论）+ CURRENT.md 交付记录"
```

---

## 收尾：迁移文件待 apply

本计划新增了三个迁移文件（`merge_anon_profiles_rpc`、`profiles_cascade`、`user_consents`，实际序号按 Task 6/7 落地时协调）。按本仓库既有流程，这些文件**只创建、不在本地执行**——写完、单测通过、交回验收方（reviewer）时，由验收方核实内容后 apply 到生产 Supabase 项目（`.agent/CURRENT.md` 里历次迁移记录的 "claude apply 成功" 就是这个流程），不是本计划任何一个 Task 的职责范围。

---

## Self-Review（写完后自查，已完成）

**1. Spec 覆盖检查**：spec §10 的 8 项建议任务拆分，本计划——
- `EP-account2-01`→Task 1 ✅
- `EP-account2-02`→Task 2 ✅（额外发现并修正：`resolveUid` 对 `next/headers` 的依赖是"3 份拷贝"问题的真正根因，spec 原文暗示的收敛方向需要反过来——先修 `resolveUid` 本身，再让另外两处收敛过来，而不是让它们直接依赖现状的 `resolveUid`）
- `EP-account2-03`→Task 3 ✅
- `EP-account2-04`→Task 4 ✅
- `EP-account2-05`→Task 5 ✅（额外发现：`/api/spirit/dream` 有和 `/api/spirit/chat` 完全同构的漏洞，spec 原文只点了后者，一并修）
- `EP-account2-06`→Task 6 ✅
- `EP-account2-07`→Task 7 ✅
- `EP-account2-08`→Task 8 ✅

**2. 占位符扫描**：无 TBD/TODO；Task 6/7 之间的迁移文件编号冲突已用显式提醒处理（不是留空号，是让实施者按落地顺序协调，这是这类"两个任务各建一个新迁移文件"场景下唯一诚实的处理方式——写死编号反而会在两个任务的执行顺序不确定时产生错误期望）。

**3. 类型一致性**：`resolveAccess`/`resolveUid`/`attachIdentity`/`recordConsentOnce`/`requireVerifiedEmailForPayment` 的签名在首次定义处（各自 Task 的 Step 3/9/11 等）与后续任务引用处（Task 5/7 的 import）逐一核对一致。`AccessLevel`/`AccessInfo`/`IdentityToAttach`/`AttachResult` 四个类型只在 Task 1/4 定义一次，其余任务只 import 不重新声明。

**4. 范围检查**：每个任务产出可独立测试的交付物（`pnpm --filter @eamvp/web test -- <路径>` 各自可跑通），任务之间的依赖关系在各 Task 的 Interfaces 小节里显式标注（Consumes/Produces），没有隐藏的隐式依赖。
