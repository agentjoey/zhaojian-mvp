# Current Status — 照见 Zhaojian

Version:        v0.1.0（线上 MVP + 引擎深化 v2 + 时序层 + UI v2 素白；未走 release.sh）
Sprint:         001
Sprint Status:  🔒 **MVP 冻结** + 🌙 **本命之灵（flag 默认关）** + 🧭 **风水「境」波1（flag 默认关，待合并）**
Last Updated:   2026-08-15 by claude-opus-5（SDD 编排：15 task，每 task 独立 review + 最终全分支 review）
线上:           https://zhaojian-mvp.vercel.app · zhaojian.agentjoey.ai
测试:           core 122 · llm 130 · web 65（全绿；`pnpm typecheck` 三包全绿）

> ⏸️ **现处于「收集反馈」阶段**：除非用户反馈驱动或线上 bug，否则不主动改代码。新需求先入 BACKLOG，待反馈后排期。
> 🌙 **本命之灵（EP-spirit，Phase1+2+3 全交付）**已合 main，但由 `NEXT_PUBLIC_SPIRIT_ENABLED` flag **默认关闭**，对外不可见、不破坏冻结。准备好收集反馈时设 `=1` 即开（命盘页对话面板+问卷+自我画像，日历每日问今）。
> 🧭 **风水「境」波1（EP-fs，分支 `feat/fengshui-wave1`，34 commits）**：`NEXT_PUBLIC_FENGSHUI_ENABLED` flag **默认关闭**，**无数据库迁移**（仍封顶 0010）。已验证 flag 关闭时既有产品不受影响：AppShell 零新增 import、无既有文件引用风水代码、core barrel 纯新增。**开启前必读下方「已知限制」——两道机械反幻觉校验目前仅对中文输出有效。**

## 产品现状（一句话）
东方命理（八字+紫微）× 西方心理占星（利兹·格林）双引擎，已上线完整闭环：
**起盘 → 命盘建档（冻结存 Supabase）→ 三段式解读（持久化）+ 当下时序 → 运势日历（每日+本年上下文+水墨配图）→ 档案**。

## 已上线能力
| 模块 | 内容 |
|------|------|
| 起盘 `/reading` | 地名→经纬度/时区(Nominatim+tz-lookup)、时辰实时显示+不知时辰开关、真太阳时(含 EoT) |
| 命盘 `/chart` | 四柱/紫微/西方盘可视化 + 三段式解读(一次生成持久化、命盘冻结) + **当下时序卡**(大限/流年四化,按年缓存) |
| 运势 `/calendar` | 每日流日(确定性五维+趋吉避祸+黄历) + **本年/本限上下文条** + 框景水墨配图 + 大字总评 + 五行干支 + 心理行为宜忌(LLM) + 轻润色 |
| 档案 `/profiles` | Supabase 匿名+RLS 隔离、命盘触发器冻结 |

## 三层架构（详见 docs/architecture.md）
- **@eamvp/core**：三引擎 + `normalizeBirth`(真太阳时+EoT+子时sect) + `computeDailyFortune` + 引擎深化 v2 派生(见下) + 共振映射；纯函数/Zod/可缓存。
- **@eamvp/llm**：provider 无关双线(anthropic MiniMax-M3 / openai DeepSeek) + 三声部+时序声部 + **反幻觉链四道**(extractFacts→prompt硬规则→sanitize→correctMutagens)+eval + 重试/缓存/观测 + daily润色/行为/时序。
- **apps/web**：Next 16/React 19/Tailwind 4，框景配图、Markdown 渲染、Supabase。

## 引擎深化 v2（本轮重点，spec `docs/specs/engine-v2-deepening.md`，全 11 项✅，TDD）
**核心原则**：新命理量在 facts 层派生、**不进冻结命盘**（新旧命盘通吃、零迁移）。
- 命理深度：旺衰证据化(502) → 用神扶抑(501) → 紫微三方四正借星(503) → 流日×本命冲合刑害+用神(504, 千人千日) → 西方画像 元素/模式/命主星/月相(505)。已接入 facts+prompt+日历，实跑验证四类新事实落地、无幻觉。
- 工程：prompt 缓存(511, 实测 MiniMax-M3 支持) · LLM 重试/超时(512) · 西方数据校验(513) · 无 PII 接地观测(514)。
- 演进：紫微大限/流年四化(521)→**时序声部** `generateTimeline` + /chart 当下时序卡 + /calendar 本年上下文 · Placidus 宫制(522, 引擎就绪默认仍 whole-sign)。

## 本命之灵 · 陪伴层（EP-spirit，2026-06-28 全交付，flag 默认关）
spec `docs/superpowers/specs/2026-06-28-natal-spirit-companion-design.md` · plan `docs/superpowers/plans/2026-06-28-natal-spirit-companion.md`
**方案 B 附加层**：不改三段式解读；`deriveSpirit(chart)` core 派生人格种子(不进冻结命盘) + llm 渲染口吻(复用反幻觉四道)。pact 编排(claude核心+review/kimi前端/opencode后端)。
- **Phase1** 灵的诞生：`deriveSpirit`(55 core 测) + 灵 prompt/开场白/多轮对话流 + `spirit_messages` 表(RLS) + `/api/spirit/chat` SSE + 命盘页对话面板/水墨印记。real-LLM 实跑接地无幻觉。
- **Phase2** 关系记忆+每日问今：`profiles.spirit_memory` 列 + `summarizeSpiritMemory`(满窗摘要,无 PII) + 记忆注入对话 + /calendar 每日问今卡(`generateDailySpiritGreeting` 接确定性五维/干支)。
- **Phase3** 问卷+画像：`profiles.questionnaire` 列 + `PROFILE_QUESTIONNAIRE`(最小5题) UI + 问卷注入灵上下文(EP-spirit-07,东西互证实跑验证) + `deriveSelfPortrait` 自我画像可视化(EP-spirit-08)。
- 开关：`NEXT_PUBLIC_SPIRIT_ENABLED=1` 开启（默认未设=关，生产不可见）。Supabase 三迁移 `0002~0004` 已对线上 apply。
- **反馈迭代(2026-06-28)**：①全面中文化（LLM 输出 zh + 原型名/画像维度/问卷题库）；②独立入口 `/spirit` 页 + 导航「灵」(flag 门控)，从 /chart 移出，日历问今详谈链接指 /spirit。

## 风水「境」波1 · Layer 0（EP-fs，2026-08-15，flag 默认关）
spec `docs/superpowers/specs/2026-08-14-fengshui-environment-design.md` · plan `docs/superpowers/plans/2026-08-14-fengshui-wave1-layer0.md` · 架构 `docs/architecture.md` §7b

补齐「命·运·**境**」第三条线。**零新用户输入**——全部从已有出生数据派生：本命卦、八方吉凶、用神喜用的色与材、按成本分级的居家调整、物件顾问（「这张书桌放哪儿」）。
- **定位**：派生层而非第四引擎，与 `deriveSpirit` 同层，不进冻结命盘、无迁移。
- **诚实标注**：`evidence: '传统象征' ⇒ modern: null` 由**判别联合编译期强制**——传统有说法但现代机制无对应解释的做法不假装有科学依据。这是产品可信度的核心，不是可选项。
- **反幻觉四道全在真实调用路径上**：facts 白名单 → prompt 硬规则 → `sanitizeFengshui` → `verifyDirectionConsistency`（方位吉凶来自查表，模型输出可**机械对拍**）。`degraded` 信号传到页面，纠正只救得回星名、救不回建立在错方位上的整段叙述。
- **降级是设计内路径**：盘图/着色/化解清单/物件建议全确定性，LLM 挂了页面仍完整可用。

**⚠️ 开启 flag 前必须先处理（否则英文市场是裸奔的）**
1. **两道机械校验仅中文有效**——`verifyDirectionConsistency` 与 `sanitizeFengshui` 都是中文匹配，`en` 输出完全不被校验，诚实标注只剩一条中文写的 prompt 规则兜底。而 CLAUDE.md 写明首发海外、英文优先。
2. **`buildFengshuiSystemPrompt("en")` 仍是「中文指令 + 末尾一句 English」**——该反模式已在 `buildObjectAdviceSystemPrompt` 修好并写进测试注释当反例，主报告这条却没改。
3. **英文页面的确定性内容基本还是中文**：化解 action/traditional/modern、`personalFit`、方位理由、物件品类与材质、`吉/凶`、`东四命/西四命`（`fengshui.group.*` 键存在但未接线）。

**其他已知限制（不阻塞合并）**：`corrections` 到 route 边界即丢弃、无日志（该失败模式会自我掩盖）；`ObjectQuery.color` 收下但从不读取；`Remedy.tenancy` 端到端是死字段（波2 勿假设它有信号）；重试无次数上限；6 组 i18n 死键待清理；`sessionStorage` 未补 polyfill（同样的 Node 22+ 问题，波及既有 account/calendar 页的未来测试）。

**spec↔交付分歧**：spec §7 承诺 `adviseObject` 返回 `remedies[]`，交付的 `ObjectAdvice` 无该字段。最终评审判定不阻塞（Layer 0 的化解是人身层面的、已在主页渲染），但应修 spec 而非补代码。注意其二阶后果：`adviseObjectText` 用「无 remedies」论证跳过整个机械层，而 `intendedVerdict` 与各 `reason` 里其实嵌着方位↔星名事实，波2 可构造出局部校验。

## Open Bugs / 已知限制
🟢 无 P0/P1。
📌 启发式（已标注，非 bug）：旺衰/用神为扶抑启发式（学派分歧大，prompt 标「启发式」并优先喂证据让模型权衡）；真太阳时含 EoT 但仍平太阳时近似。
🔭 未接入产品：EP-521 大限/流年已就绪，时间线「年→限→日」已贯通；EP-522 Placidus 仅引擎+单测。
🌙 EP-spirit 已交付但 flag 默认关——待反馈期决定开启；每日问今/画像未做 localStorage 缓存（每次现算，flag 关时无影响）。

## Next Sprint Candidates
- [ ] [EP-i18n] [HIGH] **英文版**：全站 UI 文案 i18n（中/英），LLM 输出按 locale（`ReadingLanguage` 已支持 en）；Telegram 海外市场用户按 `language_code` 自动选语言。当前全中文。
- [ ] [EP-tg-ui] [HIGH] **更适配 Telegram Mini App 的 UI**：用 Telegram WebApp 主题参数/MainButton/BackButton/viewport/haptics，做原生感而非「网页塞进 webview」；隐藏 web 底部导航、贴合 TG 交互。
- [ ] [EP-spirit-open] [HIGH] 收集反馈后开启本命之灵 flag + 真人小流量灰度（对话/问卷/画像/每日问今）。
- [ ] [EP-spirit-2] [MED] 灵深化：每日问今/画像 localStorage 缓存；自我画像叠加关系记忆(memoryPresent)；会话结束显式收束。
- [ ] [EP-cal-img-2] [MED] 配图扩库 + 筛图从人工转 agent reviewer（skill `curate-fortune-images` 已就绪）。
- [ ] [EP-cal-img-2] [MED] 配图扩库 + 筛图从人工转 agent reviewer（skill `curate-fortune-images` 已就绪）。
- [ ] [EP-timeline-2] [MED] 时间线深化：大限/流年四化叠西方行运、时序声部更厚。
- [ ] [EP-theme] [MED] 三套基调皮肤切换；[EP-auth] 账号升级跨设备同步。
- [ ] [EP-002-cal-2] [MED] 排盘金标准：调候用神、对照官方计算器。

## Version History（里程碑）
| 标记 | Date | Summary |
|------|------|---------|
| MVP 立项 | 2026-06-18 | 双体系调研 + 产品/架构/UI 设计 + 脚手架（Sprint 001） |
| MVP 三引擎+解读 | 2026-06-18 | EP-001~008 + eval + 四化纠正：三引擎 + 双线解读层 + 设计系统 + 4 图谱 + 运势日历 |
| 上线 | 2026-06-18 | EP-DB(Supabase) + EP-DEPLOY(Vercel) + EP-MODELS(维持 M3) |
| v2 上线优化 | 2026-06-19 | 起盘 UX + 西方盘重绘 + 解读持久化 + 自定义域名 |
| 运势日历升级 | 2026-06-19 | 排盘精度(EoT/子时) + 轻润色 + 水墨配图(框景) + 大字总评/五行chip/心理宜忌 |
| 引擎深化 v2 | 2026-06-19 | 11 项：命理深度(用神/旺衰/三方四正/流日互动) + 工程(重试/缓存/校验/观测) |
| 时序层 + 修复 | 2026-06-19 | 当下时序卡 + 本年上下文；markdown 渲染 / 西方盘连线重绘 / 解读泄漏修复 / 流式书写感 |
| UI v2 素白 | 2026-06-20 | 全站现代化：令牌/动效/导航/首页氛围大图/评分环/测算过场/解读 Tab 化/响应式桌面布局 |
| 🔒 MVP 冻结 | 2026-06-20 | 稳定当前版本，进入初期用户反馈收集阶段 |
| 🌙 本命之灵陪伴层 | 2026-06-28 | EP-spirit P1+2+3：从命盘派生的单一陪伴人格(对话/关系记忆/每日问今/问卷/自我画像)，附加层不改解读，flag 默认关；pact 三 agent 编排交付 |
| ✈️ Telegram 前端 P1 | 2026-06-29 | EP-tg P1 上线：grammY bot(@analyst_helen_bot)+Mini App 适配；initData→service_role 后端中介鉴权；tg_users 表；/start 拉起 Mini App 起盘建档闭环。kimi 执行/claude 审。spec/plan 见 docs/superpowers。bot 品牌名待改(现 Helen|Tradelinks)。 |
| ✈️ Telegram 前端 P2 | 2026-06-29 | EP-tg P2 上线：bot DM 原生灵对话(message:text→streamSpiritChat 落库+记忆)+/today 运势问今；免费 LLM 额度闸(consume_llm_credit RPC，默认30)；Mini App 在 TG 内读盘(/api/tg/{spirit,daily,questionnaire} 后端中介，chart/spirit/calendar/问卷接线)。端到端实跑验证(灵对话中文接地+持久化、daily、额度402)。+ 修 /profiles 页 TG 中介(档案空白)。 |
| 🎨 TG 原生 UI 地基 | 2026-06-29 | EP-tg-ui 子项目1：主题桥(跟随 TG 明/暗，深色水墨)+chrome(Back/Main button/haptics/viewport/TG 隐藏 web 导航)+原生组件(Section/Group/Cell/Bubble)+灵面板示范。非 TG web 零变化。本命之灵真形象(5 五行渲染图)上线 + LLM 额度关闭(TG_QUOTA_DISABLED)。 |
| 🎨 TG 原生 UI 各界面 | 2026-06-29 | EP-tg-ui-surfaces：深色正确性(补全 surface/tint/divider/spoke/shadow/error 令牌+硬编码浅色令牌化+框景图暗态滤镜+首页hero渐变)；起盘/命盘 MainButton+haptics；档案 native cells。5 屏跟随明暗、类原生；非 TG web 零变化(生产 6 路由全 200 回归)。bot 菜单按钮=打开 Mini App。 |
| 🌐 中英双语 i18n | 2026-07-01 | EP-i18n(spec/plan `*i18n-bilingual*`) 8 波全站：轻量自建字典(`lib/i18n` locale/I18nProvider/useT/messages{zh,en}/switch)；`detectLocale`(cookie zj_locale>navigator>zh)+LocaleSwitch(/account)；LLM 按 locale(端点读 x-zj-locale/cookie 替换硬编码 zh，客户端带 header)；全站逐面翻译(全局/导航/account/paywall·首页·起盘·命盘·运势·灵·档案，zh/en 顶层命名空间一致)。命理专名保留中文+英文注释；引擎数据(星曜/干支)不译；缺 key 回退 zh。core66/llm39 绿，7 路由 200。 |
| 👤 账号管理完整化 | 2026-07-01 | EP-account-mgmt(spec/plan `*account-management*`)：`resolveUid`(TG优先/web Bearer)；`/api/account/{identities,link-telegram,link-email,rename,delete}`；/account 已绑定展示+补绑(web账号绑Telegram/TG账号绑邮箱,conflict409/占用409)；/profiles 重命名(服务端只改nickname,命盘冻结)+删除二次确认；注销账号(admin.deleteUser 级联+清会话+强二次确认)。上线验证 identities401/rename405/JSON正常。core66/llm39绿。 |
| 💳 付费基座(会员) | 2026-07-01 | EP-billing(spec/plan `*billing-membership*`) T1-4(无凭据部分)：freemium。`entitlements` 表(tier/member_until,RLS)+`isMember`；统一 LLM 额度 `consume_llm_credit_account`(月度原子,会员bypass,迁移0009/0010已apply)；端点闸门(tg/spirit·tg/daily新生成·web spirit/chat Bearer识别,intro不计→402 paywall)；非会员档案上限3(TG服务端+web客户端)；Paywall($9月/$99年,支付占位)+/account会员状态+`/api/billing/status`。**全程 `BILLING_ENABLED` 门控(pre-prod 默认关=不限制)**。价:$9/$99·Stars月450/年4800(拟)·免费30/月·档案3。**支付 T5(Stripe)/T6(TG Stars)待凭据**。测号已设 member。core66/llm39绿。 |
| 🔑 账号与登录体系 | 2026-07-01 | EP-account(spec/plan `*-account-login-system*`)：方案A(auth.users 为账号)。①邮箱魔法链接(匿名→邮箱 linking)+/account+/auth/callback+导航；②用 Telegram 登录(core `verifyTelegramLogin` SHA256-secret 含 5 单测 + `/api/auth/telegram`→resolveOrCreateTgUser→`zj_tg`+`zj_tg_hint` cookie + Login Widget@analyst_helen_bot)；③`isTelegram()`→`hasTgSession()` 泛化数据路径(web-TG 登录复用中介，UI/chrome 仍 isTelegram)；④匿名→TG 档案归并(profiles+spirit_messages 双表重挂,幂等)；⑤/account 三态+双模式登出。core66/llm39 绿,6 路由 200。⚠️前置:BotFather /setdomain 已设；待用户在 Supabase 开 Email auth+加 /auth/callback 到 redirect 白名单。付费基座/账号管理完整化留后续。 |
| 🎨 TG 原生 UI Round2 | 2026-06-30 | EP-tg-ui-r2(plan `2026-06-30-tg-native-ui-round2.md`)：①暗态根因 bug 修复——`@theme inline`→`@theme`(工具类改引用变量，全站跟随暗态，修白卡/白按钮)+panel-strong 强调面板令牌(八字柱头/紫微中宫暗态深墨)+geocode 按钮令牌化；②深色版专图机制(运势/hero `-dark` 变体+缺图 onError 回退滤镜，真图后补)；③起盘表单深度原生(分段性别/暗态输入/geocode cell)；④TG 导航(全局 BackButton 接 TgUiProvider+首页原生 hub)。非 TG 零变化(6 路由 200)。core61/llm39 绿。 |
| ✈️ Telegram 前端 P3 | 2026-06-29 | EP-tg P3 上线：每日推送。/subscribe /unsubscribe /settings；/api/tg/cron(Bearer CRON_SECRET)；dueUsers/pushDailyTo(五维+问今，不耗用户额度，按本地日期幂等)。⚠️ Hobby 计划 cron 限每日一次→vercel.json `0 0 * * *`(北京08:00)，暂忽略 push_hour(升 Pro 可恢复按时区每小时)。endpoint 401/200 验证；真机待订阅者 /subscribe。 |
| 🧭 风水「境」波1 | 2026-08-15 | EP-fs-01~08：命·运·境第三条线。零新输入从出生数据派生本命卦/八方吉凶/用神色材/分级化解/物件顾问；派生层非第四引擎、无迁移；诚实标注由判别联合编译期强制；反幻觉四道 + degraded 降级信号；flag 默认关。SDD 编排 15 task，每 task 独立 review + 最终全分支 review。core122/llm130/web65。⚠️ 开 flag 前须先补英文侧机械校验 |
