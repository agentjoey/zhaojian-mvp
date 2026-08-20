# Current Status — 照见 Zhaojian

Version:        v0.1.0（线上 MVP + 引擎深化 v2 + 时序层 + UI v2 素白；未走 release.sh）
Sprint:         001
Sprint Status:  🔒 **MVP 冻结** + 🌙 **本命之灵（flag 默认关）** + 🧭 **风水「境」波1+波2+TG适配（flag 线上已开）**
Last Updated:   2026-08-21 by claude-sonnet-5（品牌/动效四项 + EP-dream-history：claude 直接实施，迁移 0017 已 apply 生产）
线上:           https://zhaojian-mvp.vercel.app · zhaojian.agentjoey.ai
测试:           core 159 · llm 253 · web 434（全绿；`pnpm typecheck` 三包全绿；`lint` 0 errors 已为阻塞闸门）

> ⏸️ **现处于「收集反馈」阶段**：除非用户反馈驱动或线上 bug，否则不主动改代码。新需求先入 BACKLOG，待反馈后排期。
> 🌙 **本命之灵（EP-spirit，Phase1+2+3 全交付）**已合 main，但由 `NEXT_PUBLIC_SPIRIT_ENABLED` flag **默认关闭**，对外不可见、不破坏冻结。准备好收集反馈时设 `=1` 即开（命盘页对话面板+问卷+自我画像，日历每日问今）。
> 🧭 **风水「境」波1+波2+TG适配（EP-fs，已合 main）**：`NEXT_PUBLIC_FENGSHUI_ENABLED` **线上已开启**（2026-08-16，Production + Preview 均设 `=1`），底部导航「境」对所有访客可见。迁移 `0011_dwellings` 已 apply 生产（仅新增两表）。**⚠️ 开启时英文侧缺口尚未修（见 EP-fs-en）：`detectLocale()` 对任何非中文浏览器返回 `en`，而两道机械反幻觉校验都是中文匹配、在英文路径上完全失效——这是已知且已被接受的风险，不是遗漏。**

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

## 风水「境」波2 · Layer 1 住宅实盘（EP-fs-11~18，2026-08-16，flag 默认关）
spec 同波1（§14 波2 表）· plan `docs/superpowers/plans/2026-08-15-fengshui-wave2-layer1.md` · 迁移 `0011_dwellings`（**已 apply 生产**）

在 Layer 0 之上加「房子」：居所记录（坐向 → 宅卦）、房屋八方、**合看**（同一套房子对不同住客吉凶不同）、宅层分级化解、会员闸门、物件顾问强版。新表 `dwellings` + `fengshui_reports`，RLS `own_all`（`using` 与 `with check` 皆 `auth.uid() = uid`，`pg_policies` 验过）。
- **两套八方不得互推**：「本命八方」由命卦定、「房屋八方」由宅卦定。同一方位在两表里经常是不同的星——这正是本功能的意义所在。
- **反幻觉第四道现在认识两张表**：`verifyDirectionConsistency` 按「分句→整句→块」三层递进窗口解析每句归属，每层要求恰好一套标记；**无法归属则弃权**（不改写、不记 correction），除非两表对该方位给出同一颗星。Layer 0 从不调用归属解析。
  - 遗留（刻意取舍）：Layer 1 里「无标记、非列表行、且两表判语不同」的方位陈述不再被校验。本校验器历史失败模式是**过度纠正**，代价不对称（叙述被扣 + 无上限 LLM 花费 vs 四道里少一道备份）。要收回这块覆盖，正确做法是收紧 `prompt.ts` 的标记要求，而不是让校验器猜。

**⚠️ 开启 flag 前必须先处理**
0. **波1 的三条英文缺口依然全部成立**（见上一节），波2 只是加大了暴露面。
1. ~~**【已解除 2026-08-16】TG 会话下身份不一致**~~ —— 由 **EP-fs-tg** 修复：新增 `api/tg/fengshui` 中介端点，`lib/dwellings.ts` / `lib/fengshui-report.ts` 按 `hasTgSession()` 在**数据层**分流，TG 路径的 uid 只从 HMAC 验签的 TG session 解，七处查询全带 `.eq("uid", s.uid)`。同时修掉一条 spec 未预见的：TG 的 RLS 下 `getProfile(id)` 逐条读拿 null，**合看在 TG 内一直静默失效**，改走 `tgListProfiles()` 中介。

**其他已知限制（不阻塞合并）**
- **多居所写入但不可读**：`/fengshui` 与 `/fengshui/object` 都硬取 `dwellings[0]`，第 2 套及以后只作为管理列表里的一行存在。最终评审 I2 据此**撤除了多居所付费墙**——为零可观察产出收费不可辩护。日后做切换器时需**同时**新建服务端写入路由：`createDwelling` 是浏览器直写 Supabase，届时任何纯客户端闸门都可绕过。
- **`DwellingForm` 编辑回显不可达**：`initial` prop 与 `updateDwelling` 都实现且有单测，但页面无编辑入口 → 生产走不到。归 EP-fs-tg §4.2（与 §4.1 的原生 `confirm()` 一并修）。
- 探测失败路径会发两次 LLM 调用（`unknown` 发 Layer-0 一次，重试进 `entitled` 改指纹再发一次）；两次都是真实缓存未命中，代价由用户显式点击封顶，接入支付后值得重估。
- cookie 解析现存两份拷贝（EP-account2 已把 `api/fengshui/reading` / `billing/status` 收敛进 `resolveUid`，第三份留在 `GET /api/tg/session` 的内联解析——它需要 exp/uid 等 session 字段做续期判断，而 `resolveUid` 只返回 uid）；待 `resolveUid` 扩返回 session 字段后可收敛最后一份。
- `packages/core/tsconfig.json` 的 `include` 只有 `["src"]` → `core/test/` 不过类型检查，写在那里的类型断言是**惰性的**。已从台账升入正式待办。

## 风水「境」· Telegram 适配（EP-fs-tg，2026-08-16）
spec `docs/superpowers/specs/2026-08-15-fengshui-telegram-adaptation.md` · pact: worker `kimi` 实现 / reviewer `claude` 验收（两轮 changes-requested）

- `app/api/tg/fengshui/route.ts` 中介端点（GET 居所列表 / `?fingerprint=` 读报告；POST `action` 分发 CRUD、报告写入、解读生成）。鉴权手法与 `api/fengshui/reading` 一致（`req.headers` 读 cookie 而非 `cookies()`——后者依赖 Next 请求上下文，直接 import handler 的单测拿不到）。
- 闸门规则抽到 `lib/fengshui-reading.ts` 的 `isFengshuiEntitledForUid`，**web 与 TG 两条路由共用单一事实源**：`BILLING_ENABLED !== "1"` 无条件放行、`!uid` fail-closed、`wantsLayer1` 要求 `cohabitants.length > 0`。
- **计量：刻意不做**（评审必修2 选 a）。web 侧风水路由本就没有计量、同样的花费在本端点出现前即可达；只给 TG 加会造出「TG 有上限、web 没有」的反向不一致。风水全链路统一计量留到接支付（billing T5/T6）时一起做。
- 四个界面 TG 原生化（`Segmented` 双模式：传 `idBase` = 完整 tab 契约含方向键漫游；不传 = `role="group"` + `aria-pressed`）。**tabpanel 属性必须按 `inTg` 门控**——R2 复审抓到它曾漏到 web 路径，留下没有 tablist、`aria-labelledby` 悬空的孤儿 tabpanel（为改善无障碍做的修复反而把 web 的无障碍改坏）。
- spec §4.1 全 app 唯一的原生 `confirm()` → 页内两步确认；§4.2 居所编辑入口接上（此前 `initial` 回显有实现有单测但无入口，且 `DwellingForm` 的超限截断逻辑因此不可达 → 持有超限同住人 id 的历史居所用户永远修不好）。
- **收尾补丁 `6ff687c`：TG 首页入口**。合并后发现风水在 Mini App 内**入口数为零**——`AppShell.tsx:40` 用 `{!tg && (…)}` 把 web 导航整个包住，TG 内唯一导航是 `app/page.tsx` 的 `TG_ENTRIES` 硬编码列表，而风水只加进了 `AppShell.NAV`。本项目**第三次**「建好但不可达」（前两次：波1 合看引擎无选择 UI、居所编辑回显无入口），根因是 EP-fs-tg 的 spec 只列了「四个界面要原生化」，从没问「TG 用户怎么走到它们」。已加入口 + 补 `app/__tests__/page.test.tsx`（`TG_ENTRIES` 此前零覆盖），两个变异实跑验证。
- 已知未覆盖：**web 侧 kind/tenancy 选择器零点击覆盖**（既有缺口，非本次引入；验收时把两个宿主 4 处 `onChange` 全改空函数只红 1 条）。`Cell` 的 `onClick` 挂在 `<div>` 上无键盘可达性（仓库既有模式，web 侧编辑是真 `<button>`，不受影响）。

**⚠️ 产品未决**：**强版物件顾问对约一半会员零价值**。八宅结构决定命卦吉方 ∩ 宅卦吉方只可能是 4 或 0（枚举 8×8 全组合验证；评审进一步枚举 276,480 组输入确认），故 `usable ≡ good`——强弱两版的 `recommendedDirections` **逐字节相同**，唯一差异是 `dwellingNote` 一句话，且只在异组时出现。8 个朝向里 4 个得到同组宅卦，那些会员的输出与免费层永远完全一致。选项：①并入免费层，会员靠 Layer 1 撑 ②回 core 重新设计 `adviseObject` 让强版真的不同 ③维持现状。**待产品决策，不阻塞合并。**

## Open Bugs / 已知限制
🟢 无 P0/P1。
📌 启发式（已标注，非 bug）：旺衰/用神为扶抑启发式（学派分歧大，prompt 标「启发式」并优先喂证据让模型权衡）；真太阳时含 EoT 但仍平太阳时近似。
🔭 未接入产品：EP-521 大限/流年已就绪，时间线「年→限→日」已贯通；EP-522 Placidus 仅引擎+单测。
🌙 EP-spirit 已交付但 flag 默认关——待反馈期决定开启；每日问今/画像未做 localStorage 缓存（每次现算，flag 关时无影响）。

## Next Sprint Candidates
> 2026-08-21 清理：本节此前长期未同步，`EP-i18n`/`EP-tg-ui`/`EP-spirit-open` 早已交付
> （i18n 2026-07-01、TG UI 三轮均见下方 Version History；`NEXT_PUBLIC_SPIRIT_ENABLED`
> 实测 Vercel 上 Preview+Production 均已开），`EP-auth` 由 `EP-account`(2026-07-01)+
> `EP-account2`(2026-08-20) 完整覆盖——全部移出。待办唯一列表是 `.agent/BACKLOG.md`，
> 本节不再重复维护，收进 BACKLOG 后清空。

- [ ] [EP-fs-en] [**P1，flag 已开**] **风水英文侧反幻觉**：两道机械校验（`verifyDirectionConsistency` / `sanitizeFengshui`）仅中文匹配，en 输出完全不被校验；`buildFengshuiSystemPrompt("en")` 仍是中文指令 + 末尾一句 English；英文页面确定性内容基本还是中文。**`detectLocale()` 对任何非中文浏览器返回 `en`，所以这是绝大多数访客的默认路径，而非边缘情况。风水 flag 已于 2026-08-16 线上开启，此项已从「flag 阻塞项」变为线上待修。**（同条见 `BACKLOG.md` 🔴 HIGH）

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
| 风水波2 · Layer 1 | 2026-08-16 | EP-fs-11~18：居所/宅卦/房屋八方 + 合看 + 宅层化解 + 会员闸门 + 物件顾问强版；迁移 0011（已 apply 生产）。最终全分支评审揪出跨 task 缝隙 C1——反幻觉第四道只认识命卦表，会把关于房屋的正确陈述改写成假话并永久 degraded；已修为按归属分辨两张表、无法归属则弃权 |
| 风水 TG 适配 + 开 flag | 2026-08-16 | EP-fs-tg：`api/tg/fengshui` 中介端点 + 数据层会话分流 + 四界面原生化；解除 TG 身份不一致阻塞项，并修掉「合看在 TG 内静默失效」。同日 `NEXT_PUBLIC_FENGSHUI_ENABLED` 线上开启（Production + Preview）。pact：worker kimi / reviewer claude，两轮 changes-requested |
| 🏮 全站当代东方重设计 | 2026-08-18 | EP-east-ui：依据 contemporary-eastern 指南+Pencil 稿——令牌重建(暖白纸底/朱砂#A84638/圆角0-8px/阴影清零/--color-line-strong)；PageHeader 统一全站页头(中文眉标,拉丁 kicker 全清)；卡片网格→细线编辑式列表；首页卷首(风铃+盘环出血)/calendar 花窗日签(FortuneFrame 复活+干支圆章+宜忌方标)/CastingOverlay 纸底仪式；导航激活墨底去投影回弹。TG 原生臂组件未重排（仅吃令牌变化）。本分支还含 `d275ca0`（风水 UI：muted 对比度 P0、星名 pill、首揭仪式、盘即导航、剪影付费墙 +168 行测试）。web256 绿 · typecheck 0 · lint 0 errors · 6 路由 200 |
| 🏮 当代东方 R2 对齐设计稿 | 2026-08-18 | EP-east-ui-r2(feat/east-ui-r2)：BaguaWheel 细环卦字版(填充扇区/pill 全废,四吉墨色/生气朱砂/四凶 muted,选中短划线,API 零变化)；BaziPillars 文字四柱+朱砂白文「主」章(圆徽/日柱深块废)；ZiweiBoard 12 小卡→共享细线格(身宫朱砂「身」字);GanzhiBadge 墨底圆章(五行色撤出)；TG 原生臂对齐(hub 眉标/native 细边圆角令牌化/Segmented 去影)。web267 绿(含 11 条图表新测试)/typecheck/lint 0 err/build 过;变异 6 条实跑还原 |
| 🗣️ 灵口吻优化 | 2026-08-19 | EP-spirit-voice(feat/spirit-voice)：治冗长/重复/AI味——聊天长度硬规则(≤3句120字,展开才6句,单事实引用,默认不问句结尾,锚点不复引)+maxTokens 1200→360；persona 加 voiceSamples 五原型台词(中英)+中英禁用清单；eval/voice 风格探针(checkVoice 纯函数单测+probe:voice 实跑脚本)。反幻觉四道零改动。llm215/core159/web279 绿 |
| 🌙 解梦 | 2026-08-20 | EP-dream(feat/dream)：灵解梦技能+独立入口 /dream（web+TG 双臂）——锚人不锚梦/四拍口语/sanitizeDream 双语机械扫描/梦原文不落库/DREAM_ENABLED 默认关。**验收修复轮**（claude 评审打回 3 阻断，逐条变异实证复验通过）：①`sanitizeDream` 豁免作用域段级→句级（prompt「一段口语」形态下原实现是空转的，实测单段剥 0/分行剥 1）②补管线闸门测试+探针改报真实剥离数（原 `predictionStripped 恒 0` 是对成品重扫的循环论证）③en 侧裸 `"folk"` 子串误伤 folks/folklore 改词边界正则。另补两处验收后续：spec §4 流式→buffered 同步（`sanitizeDream` 需完整文本，流式会先漏出待剥句）；TG+web 双臂记忆提炼补齐（TG route fire-and-forget `summarizeSpiritMemory`→`saveMemory`，web `/dream` 页挂载取 memory/questionnaire 随请求体带上+成功后 `spiritMemoryAction`→`saveSpiritMemory` 写回，同 SpiritPanel 模式）。llm246/web308 绿，typecheck 0，lint 0 errors，全部关键改动变异实证 |
| 🔐 账号体系重建 | 2026-08-20 | EP-account2(spec `2026-08-20-account-system-redesign-design.md`)：诚实化「已验证邮箱」信号（`resolveAccess` 三层访问语义 + 排除合成域名）；会话 TTL 单一常量(30天+滑动续期)收敛 exp/cookie maxAge 三处硬编码；`resolveUid` 去 `next/headers` 依赖，收敛 3→2 份重复 cookie 解析（第三份留在 `GET /api/tg/session`，见上方「其他已知限制」）；`/account` 真正消费会话确认结果；`attachIdentity` 对称化取代 link-email/link-telegram；堵住 `spirit/chat`+`spirit/dream` 的 LLM 闸门静默放行漏洞（`if(userId)`→无限免费）；匿名档案迁移改单事务 RPC；`profiles` 级联迁移可验证 + `user_consents` 条款记录；TG 建号 仍需合成邮箱，域名单一事实源。鉴权面此前**零测试**，本轮补齐。web405/core159 绿（验收时记录的 383 为笔误，以 runner 实际输出 405 为准），typecheck 0，lint 0 errors，全部关键改动变异实证。**验收修复轮**（claude 复验 1 橙 2 黄）：①`consume_llm_credit`/`consume_llm_credit_account` 两个 security definer RPC 回收 PUBLIC/anon EXECUTE（迁移 0015，与 0012 同类洞，知道 uuid 即可烧干别人月度免费额度）②web widget 会话续期断链——`AppShell` 挂载时对「非 TG + zj_tg_hint」会话 fire-and-forget 调 GET /api/tg/session，不再只有 /account 一个续期点 ③本表计数与 cookie 份数修正。**阻断修复轮**（claude 接手重设计，评审两轮独立发现同一个洞）：邮箱绑定原设计按「邮箱字符串」全库反查目标账号——任何登录用户可为尚未注册的邮箱预埋意向，真正所有者首次注册时被 `deleteUser` 删号、邮箱归攻击者。改为一次性 nonce 定账号（随 `emailRedirectTo` 走 URL，普通注册链接不含 nonce）+ 释放地址从删号改可逆改名 + `/account` 新增知情同意确认屏；意向存储迁至服务端表 `email_bind_pending`（迁移 0016，RLS 开启不建策略=仅 service_role）。**收尾轮**：revoke 守护测试补 `^` 行首锚定（原为无锚定正则，注释掉 revoke 语句测试仍全绿）；`resolveUid.needsRefresh` 全仓零消费方，删除而非接线（续期已由 AppShell 挂载→`GET /api/tg/session` 完成）。web421/llm246/core159 绿，lint 18 warnings（基线），typecheck 0，build 通过。⚠️ `0012`~`0016` 五条迁移**已 apply 生产**（逐条查库验证：ACL/级联类型/RLS/外键条数），已合并 main（`5672a4e`）。 |
| 🔔 品牌/动效四项 + 解梦历史 | 2026-08-21 | claude 直接实施（非 kimi 交接），5 项 backlog：①favicon 换风铃（`app/icon.svg`+多尺寸 `favicon.ico`+`apple-icon.png`，Next 文件约定自动接入）②导航「境」小字改「风水」（en 同步 "Space"→"Feng Shui"，大字 char 不变）③风铃动效常驻弱晃→进入/点击敲响一次（`BellLogo` 新增 `motion` 参数：`idle`/`ring`；`CastingOverlay` 仍用 `idle`）④解梦（buffered、此前等待零反馈）接入 `CastingOverlay`，`/chart` 解读生成首字等待换品牌风铃图标（原地渲染不用全屏遮罩）⑤`EP-dream-history`：最近 10 条解梦历史 + 同会话追问——只存 `summarizeDreamEntry` 生成的第三人称摘要（≤160 字，禁止逐字复述），不存原文，与 spec §5.1 红线一致（spec 补 §7.1）；`continueDreamReply` 复用与首次解读相同的 system prompt/护栏/`sanitizeDream`；新表 `dream_history`（迁移 0017，RLS 照抄 `spirit_messages`）。web434/llm253/core159 绿，typecheck 0，lint 0 errors（18 warnings 基线不变），build 通过。⚠️ 迁移 `0017` **已 apply 生产**（查库验证 RLS/policy/FK/index），已合并推送 main（`e8f5d57`）。 |
