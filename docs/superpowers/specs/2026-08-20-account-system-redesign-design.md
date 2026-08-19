# 账号注册与管理体系重建 · 商业化准备 — Design Spec

- **Date:** 2026-08-20
- **Status:** Draft（方案已与 owner 确认 = 方案 A，待 writing-plans 拆实施计划）
- **代号前缀:** `EP-account2-*`
- **前序资产:** `2026-07-01-account-login-system-design.md`（原账号体系）· `2026-07-01-account-management-design.md`（账号管理）· `2026-07-01-billing-membership-design.md`（付费基座 T1–T4 已交付，支付 T5/T6 卡凭据）

---

## 1. 为什么重建

付费基座（`entitlements` / `isMember` / 月度原子额度 / 端点闸门 / Paywall UI）已在 2026-07-01 交付，支付集成因缺凭据未做。在真正开始收钱之前重审账号体系，发现四处**在收钱之后修代价会高得多**的问题：

| 问题 | 现状 | 收钱后的后果 |
|---|---|---|
| 影子邮箱污染「已验证」信号 | TG 用户被创建为 `email: tg_{id}@zhaojian.local` 且 **`email_confirm: true`** | 任何「有没有已验证邮箱」的判断对全体 TG 用户直接放行——找回/收据/客服全部落空 |
| 会话静默失效 | `makeSessionToken` 硬编码 `exp = now + 3600`，而 web widget 路径 cookie `maxAge` 为 30 天且**无续期机制** | 付费用户 1 小时后被静默登出，UI 仍显示已登录，所有写操作 401 而客户端无感知 |
| 免费额度可刷 | 额度按 `uid` 计；web 匿名 `uid` 来自 `signInAnonymously()`，清浏览器存储即得新 uid + 新额度 | 免费额度形同虚设，且用户自己也可能莫名丢失全部档案 |
| 鉴权面零测试 | `resolveUid` / `mergeAnonProfiles` / `link-email` / `link-telegram` / `account/delete` / 会话签发 **无任何测试文件** | 全仓唯一零覆盖的关键面，同时是不可逆操作（注销）与安全敏感面 |

**另有一处 LLM 闸门漏洞**（严格说不属于账号体系，但由同一根因引发、必须一并修）：`/api/spirit/chat` 写的是 `if (!isIntro && userId)`——未带 Bearer token 时 `userId` 为 `undefined`，**闸门被整个跳过**，等于无限免费。

**决策前提（owner 确认）**：
- 支付尚未排期 → 有余量把模型做对，而不是打补丁
- 线上无真实用户数据（仅测试号）→ **可做破坏性重建，零迁移成本、不写兼容层**

## 2. 方案选型

**采用方案 A：保留 `auth.users` 为账号主体，重建其身份语义。**

被否方案：
- **B（引入独立 `accounts` 表，`auth.users` 降级为纯认证凭据）**：现有全部 RLS 策略写的是 `auth.uid()`，改动面极大；且 Supabase 原生已提供多身份模型（一个 `auth.users` 挂多条 `auth.identities` + `linkIdentity()`），自建 accounts 表等于把这套能力重新实现一遍。在没有真实用户、也没有第三方登录需求的当下，这份灵活性买不到具体东西。
  - ⚠️ B 唯一真正更强的场景是**多个登录人共享一个付费账号**（家庭/团队订阅）。注意「一个 uid 下多个命盘」已由 `profiles` 表满足，不是 B 的理由。真要做家庭订阅时，本 spec 的 `resolveUid` + `attachIdentity` 两层抽象正是升级切入点，不必推倒重来。
- **C（弃用 Supabase Auth 自建会话层）**：为修一个会话 bug 和一个假邮箱，扔掉 magic link、RLS 集成等一整套可用基础设施，不划算。

**A 对将来接 Apple/Google 的影响**：正面。接入 = Supabase 后台开 provider + 前端 `signInWithOAuth({provider})`，身份创建/合并/token 刷新由 Supabase 处理。前提是**本次必须把绑定做成对称的**（见 §5），否则会演化成 `link-google`/`link-apple` 四条各自为政的路由。Telegram 是唯一必须自定义的分支（非 Supabase 原生 provider），A 和 B 都躲不掉。

## 3. 身份模型与三层访问语义

**账号主体**：`auth.users`（不变）。身份三种：`email`（Supabase 原生 magic link）、`telegram`（`tg_users` 自定义映射）、将来 `google`/`apple`（Supabase 原生）。

**核心修正：让「有没有真邮箱」成为诚实事实。** TG 首次进入时创建**无邮箱用户**，绑定真邮箱时才写入 email 并走真实验证流程。

⚠️ **实施阶段必须实测**：`auth.admin.createUser({})` 不带 email 能否创建用户（服务端无法调用客户端的 `signInAnonymously()`）。**判定函数必须设计成两种情况都正确**——即使不得不保留占位邮箱，`hasVerifiedEmail` 也显式排除该合成域名，不依赖「影子邮箱已被消灭」这一假设。

```ts
type AccessLevel = "anonymous" | "identified" | "member";

/** 全站唯一事实源，替代散落各处的 isTelegram()/hasTgSession()/裸 uid 判断 */
async function resolveAccess(uid: string): Promise<{
  level: AccessLevel;
  hasVerifiedEmail: boolean;   // 排除合成域名，不认 email_confirm 的表面值
  hasTelegram: boolean;
}>;
```

| 层级 | 判定 | 能做什么 |
|---|---|---|
| `anonymous` | 无 TG 映射 **且** 无真实已验证邮箱 | 排盘、查看四柱/紫微/星盘等**确定性内容**（零边际成本） |
| `identified` | 有 TG 映射 **或** 有真实已验证邮箱 | 上述 + LLM 解读，**计入免费额度** |
| `member` | `identified` + 有效订阅 + `hasVerifiedEmail` | 上述 + 会员权益 |

分层按**真实成本**切：确定性计算零边际成本，LLM 才烧钱。额度从第一次计费起就挂在能找回的身份上。

**门控点**：
- 排盘 / 存档案：`anonymous` 即可
- 所有 `consumeLlm` 调用点：要求 `identified`。**取不到已识别身份必须拒绝（401/402），不得静默放行**——锁死 §1 提到的闸门漏洞
- 发起支付：要求 `hasVerifiedEmail`（见 §5）

**匿名档案归属迁移**：匿名用户排的盘挂在匿名 uid 上，绑定身份后须跟随迁移。现有 `mergeAnonProfiles` 做两次独立 update（`profiles` + `spirit_messages`），**非事务**——半迁移会让用户丢一半数据。改为单个事务性 RPC，或至少幂等可重试。

## 4. 会话与鉴权统一

三处病灶同根：签发、解析、客户端判断三者各说各话。

**① 生命期对齐**：token `exp` 与 cookie `maxAge` 由**单一常量驱动**，不允许两处分别硬编码。取值 **30 天 + 滑动续期**（剩余不足 7 天时在下一次已鉴权请求上重新签发）。Mini App 现由 `ensureTgSession()` 在客户端每次调用重签，本次收进服务端共享层，两条路径行为一致。

> **已接受的权衡（owner 确认）**：仍为无状态签名 cookie，**无服务端吊销**——cookie 被盗则 30 天内有效，做不了「登出所有设备」。现有 1 小时短命期是意外获得的止血带。消费级产品 30 天滑动是惯例；真需要吊销能力时再引服务端会话表，`resolveUid` 即接入点。

**② 解析收敛一处**：cookie 解析现有 3 份拷贝（`api/fengshui/reading`、`billing/status`、`tg/session`，CURRENT.md 已记为技术债），全部收敛到 `resolveUid()`。

**③ 客户端真值**：这是「UI 显示已登录、实际早已失效」的直接原因——
- `hasTgSession()` 只查独立的长效 hint cookie（`zj_tg_hint=1`），**从不检查真实会话**
- `/account` 有一次 `fetch("/api/tg/session")` 确认调用，但**响应体被整个丢弃**（`account/page.tsx:66-76`），无任何逻辑对失效作出反应

改为：hint cookie 与会话 token **同生同死**（同一 maxAge、同一签发点写入、验证失败时一并清除）；`/account` 真正消费确认结果，失效则落到未登录态并给出重新登录入口。

```
签发：issueSession(uid, tgId) ──┐
                                ├── 同一常量 SESSION_TTL
解析：resolveUid(req) ──────────┘   （token exp === cookie maxAge === hint maxAge）
         ├── zj_tg cookie（TG 两条路径）
         ├── web Bearer token（Supabase 会话）
         └── 返回 { uid, via, needsRefresh } → 调用方按需重签
```

## 5. 绑定对称化与付费门槛

**绑定收成一个概念。** 现有两条路由各带各的鉴权前提（`link-email` 要求 `via === "tg"`、`link-telegram` 要求 `via === "web"`）——该不对称源自「绑你没用来登录的那个」这一偶然逻辑，把系统锁死在双身份世界。

新规则：**任何有效会话都可绑定本账号尚未拥有的任意身份类型**。前置校验统一三条：会话有效 / 该身份未被其他账号占用（409）/ 本账号尚未绑过该类型。

```
attachIdentity(uid, identity)
├── email / google / apple → 委托 Supabase 原生（linkIdentity / updateUserById + 验证流程）
└── telegram               → tg_users 映射（唯一自定义分支）
```

接 Google/Apple 时新增的是一个枚举值，不是一条新路由。

**同邮箱撞车策略**（现在定，接 OAuth 时生效）：信任来自 magic link / Google / Apple 的**已验证**邮箱，同邮箱自动归并到同一账号。安全代价明说：等于承认「控制该邮箱者即账号主人」——消费级通行做法，但意味着 provider 账号被盗即账号被盗。
⚠️ **实施阶段必须实测**：Supabase 对同验证邮箱的默认归并行为，据以决定是否需要额外配置。

**付费门槛位置**：卡在**发起支付前**，不在回调后——回调时款已收讫，再拒绝即成退款问题。
- Web：`/api/billing/checkout` 校验 `hasVerifiedEmail`，不满足返回特定错误码，Paywall 就地展开「绑定邮箱」而非将用户踢走
- TG Stars：bot 发送 invoice 前同一道校验

这是 §3 诚实信号的兑现点——**若影子邮箱仍带 `email_confirm: true`，此门形同虚设**，全体 TG 用户直接通过。两者是同一件事的两端。

**解绑：v1 明确不做。** 一旦允许即需处理「解掉最后一个身份 = 永久锁死自己」「会员解掉邮箱 = 失去找回锚点」等边界，当前无真实需求。

## 6. 合规最小面

**① 删号可验证。** `tg_users`/`spirit_messages`/`entitlements`/`llm_credit_account`/`dwellings` 均可在迁移文件中读到 `ON DELETE CASCADE`，但 **`profiles` 表自身建表迁移不在仓库内**（编号自 `0002` 起跳，建于迁移被跟踪之前）——注销时最核心那张表的级联行为**无法从源码核实**。收钱产品上不可接受。

- 补一条**幂等迁移**，显式化 `profiles.user_id → auth.users(id) ON DELETE CASCADE`（存在则跳过、缺失则补），让 schema 真相回到仓库
- 加一条**不依赖数据库的单测**：读迁移文件，断言「用户数据表清单」中每张表都有级联约束。该断言真正防的是**将来新增表时漏加级联**（本仓已有「新功能只加一处入口」的前车之鉴）

**② 条款接受记录。** 新增 `user_consents (user_id, document, version, accepted_at)`。记录点落在 §3 分层线上：**匿名浏览不记录，身份建立那一刻才记录**——语义上成立，那才是关系开始的时刻。

带 `version` 列但**不建版本管理机制**（最小面）：条款改版时插新行即可，无需改表结构。

## 7. 测试策略

鉴权面是全仓唯一零覆盖的关键面，同时是不可逆操作（注销）与安全敏感面（`verifyTelegramLogin`、会话签发）。按本仓既有纪律补齐（变异实证、无空转断言、每条断言自问「改坏了会红吗」）：

| 面 | 要锁住的行为 |
|---|---|
| `resolveAccess` | 三层判定边界，尤其**影子邮箱不得被认成已验证** |
| 会话 | token exp 与 cookie maxAge 同源；滑动续期触发点；过期即拒 |
| `attachIdentity` | 身份被他人占用 → 409；重复绑定；三条前置校验各自正反例 |
| 付费门槛 | 无已验证邮箱 → 拒绝发起支付（web + TG 两条） |
| 归属迁移 | 匿名档案迁移的幂等性与失败可重试 |
| 注销 | 级联清单完整（§6 读迁移文件的断言） |
| LLM 闸门 | **取不到已识别身份必须拒绝**——锁死 `if (userId)` 静默放行漏洞 |

## 8. 明确不做（v1）

- 支付集成本身（Stripe / TG Stars）——留在 billing spec T5/T6，卡凭据
- Google / Apple 登录实装——本次只把接缝留对（§5 `attachIdentity`）
- 解绑身份、登出所有设备 / 服务端会话表、数据导出、家庭/团队账号
- 一次性邮箱防刷（YAGNI）
- 同意项版本化管理机制（仅留 `version` 列）

## 9. 实施阶段必须实测的前提

以下两条**不得凭记忆写死**，须在实施时以真实环境验证并将结果记入实现说明：

1. `auth.admin.createUser({})` 不带 email 能否创建用户 —— 决定影子邮箱能否被彻底消灭。§3 判定函数已设计为两种情况均正确，故此条**不阻塞设计**，只影响实现分支。
2. Supabase 对同验证邮箱的默认归并行为 —— 决定 §5 策略是否需要额外配置。

## 10. 建议任务拆分（供 writing-plans）

- `EP-account2-01` `resolveAccess` 三层判定 + `hasVerifiedEmail` 诚实化（含合成域名排除）+ 单测
- `EP-account2-02` 会话统一：单一 TTL 常量、`issueSession`/`resolveUid` 收敛、滑动续期、hint cookie 同生同死 + 单测
- `EP-account2-03` 客户端真值：`hasTgSession` 改为消费真实会话状态、`/account` 响应失效 + 测试
- `EP-account2-04` `attachIdentity` 对称化（替换 `link-email`/`link-telegram` 两条路由）+ 409 占用校验 + 单测
- `EP-account2-05` 门控接线：全部 `consumeLlm` 调用点要求 `identified`（修 `if (userId)` 漏洞）+ 付费门槛校验 + 路由测试
- `EP-account2-06` 匿名档案归属迁移事务化 + 幂等测试
- `EP-account2-07` 合规：`profiles` 级联幂等迁移 + 级联清单单测 + `user_consents` 表与记录点
- `EP-account2-08` TG 无邮箱用户创建（依 §9.1 实测结果择分支）+ CURRENT.md
