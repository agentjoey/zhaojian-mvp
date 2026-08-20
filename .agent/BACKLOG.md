# Product Backlog — 照见 Zhaojian（zhaojian-mvp）
> 线上 https://zhaojian-mvp.vercel.app · 排入 Sprint 后从此处移除。

## 🔴 HIGH
### 风水「境」（EP-fs-*，**flag 2026-08-16 起线上已开**）
波1 Layer 0 / 波2 Layer 1 / TG 适配均已交付并合并 main。详见 `.agent/CURRENT.md` 风水三节与 `docs/architecture.md` §7b。

- [ ] **[EP-fs-en] [HIGH·线上待修] 英文侧反幻觉补齐**——两道机械校验（`verifyDirectionConsistency` / `sanitizeFengshui`）都是中文匹配，`en` 输出**完全不被校验**，诚实标注只剩一条中文写的 prompt 规则兜底。
  **⚠️ 性质已变**：此项原为「开 flag 前置」，但 flag 已于 2026-08-16 开启（用户知悉并接受该风险），所以现在是**线上待修**而非阻塞项。且暴露面比原描述更大——`detectLocale()`（`lib/i18n/locale.ts:9`）对任何非中文浏览器返回 `en`，那是绝大多数访客的**默认**路径，不是边缘情况。
  含三小项：①两道校验支持英文（方位名/星名/伪科学措辞的英文形态）②`buildFengshuiSystemPrompt("en")` 改为完整英文指令（目前仍是「中文指令 + 末尾一句 English」；该反模式已在 `buildObjectAdviceSystemPrompt` 修好并写进测试注释当反例）③英文页面的确定性内容仍基本是中文：化解 action/traditional/modern、`personalFit`、方位理由、物件品类与材质、`吉/凶`、`东四命/西四命`（`fengshui.group.*` 键已存在但未接线）。

- [x] ~~**[EP-fs-tg] 风水的 Telegram 适配**~~ —— **2026-08-16 交付**（pact：worker `kimi` / reviewer `claude`，两轮 changes-requested）。`api/tg/fengshui` 中介端点 + 数据层按 `hasTgSession()` 分流 + 四界面原生化 + 页内两步确认 + 居所编辑入口。解除了「TG 身份不一致」这一开 flag 阻塞项，并修掉一条 spec 未预见的：TG 的 RLS 下 `getProfile(id)` 逐条读拿 null，**合看在 TG 内一直静默失效**。
  收尾补丁（`6ff687c`）：TG 首页 `TG_ENTRIES` 加「境」入口——此前风水在 Mini App 内**入口数为零**（只加进了 `AppShell.NAV`，而 TG 不渲染 web 导航）。

## 🟡 MED（风水遗留）
- [x] ~~**[EP-fs-wave2] 风水波2 · Layer 1 住宅实盘**~~ —— **2026-08-16 交付**（12 task，每 task 独立评审 + 最终全分支评审）。`dwellings` / `fengshui_reports` 表（迁移 0011，已 apply 生产）、宅卦、多住客合看、租房过滤、会员闸门、物件顾问强版。

- [ ] **[EP-fs-debt] 风水技术债**（逐条已按当前代码核对，2026-08-16）
  - `corrections` 到 route 边界即丢弃、**无日志**——`degraded` 布尔量会随 JSON body 传到页面并触发降级 UI，但被纠正的具体内容不落任何日志。该失败模式会自我掩盖，建议 `degraded` 时 `console.warn` 出 corrections。**仍未做。**
  - `ObjectQuery.color` 收下但从不读取（要么接 `ELEMENT_COLORS`，要么连同死 i18n 键一起删）。**仍未做。**
  - `sessionStorage` 未补 polyfill（与 `localStorage` 同一个 Node 22+ 问题，会绊倒未来给 account/calendar 页写的测试）。**仍未做。**
  - 重试无次数上限（每次 1600 token）；死 i18n 键待清理。**仍未做。**
  - ~~`Remedy.tenancy` 端到端是死字段~~ —— **波2 已接通**：`sortRemedies(list, {tenancy})` 按租住/自有排序，`page.tsx` 真的传了 `dwelling.tenancy`。
  - **[新增] `TG_ENTRIES` 完全没有 flag 门控**——`app/page.tsx` 的 TG 入口列表里「灵」是无条件显示的，而 `AppShell.NAV` 里它受 `NEXT_PUBLIC_SPIRIT_ENABLED` 门控。今天无用户可见问题（spirit flag 线上开着），但关掉 spirit 后 TG 用户仍会看到入口、点进去是「未启用」页。风水项已按正确方式门控，spirit 项未动（改它会变更线上行为）。
  - **[新增] `/fengshui` 硬取 `dwellings[0]`，无多居所切换器**。多居所付费墙已在最终评审中撤除（为零可观察产出收费不可辩护）。日后做切换器需**同时**新建服务端写入路由——`createDwelling` 是浏览器直写 Supabase，届时任何纯客户端闸门都可绕过。
  - **[新增·产品未决] 强版物件顾问对约一半会员零价值**——八宅结构决定 `命卦吉方 ∩ 宅卦吉方` 只可能是 4 或 0，故强弱两版推荐方位逐字节相同，唯一差异是 `dwellingNote` 一句话且只在异组时出现；8 个朝向里 4 个是同组。选项：①并入免费层，会员靠 Layer 1 撑 ②回 core 重新设计 `adviseObject` ③维持现状。

## ⏸️ 已设计·MVP 后实施
- [ ] [EP-concurrency] 并发架构（多用户 & LLM 并发）。设计完成 `docs/specs/concurrency-architecture.md`。触发条件：接近 MiniMax 上限或峰值并发上升。MiniMax-M3 限额（官方查证）：**RPM 200 / TPM 10M**（TPS/并发未公布）→ RPM 200 是硬约束、TPM 不是瓶颈；MVP 不会触顶。落地序：Tier0(Fluid Compute+maxDuration+单飞) → Tier1(全局信号量/AI Gateway) → Tier2(异步队列+Realtime)。

## 🟡 MED（品牌 & 动效 · 2026-08-20 owner 提出）
- [ ] **[EP-brand-favicon] favicon 换成风铃图标**——现在是 `apps/web/app/favicon.ico`（Next 默认残留），与全站视觉无关。改用 `BellLogo`（`components/ui.tsx:18`）同源的风铃造型，导出多尺寸（含 apple-touch-icon）。⚠️ 该 svg 目前是内联组件而非独立资源文件，需要先抽出一份可导出的源。

- [ ] **[EP-dream-history] 解梦保存最近 10 条 + 可追问**——当前解梦是一次性的：`/dream` 页出完解读就没了，且**梦原文按 spec §5 明确不落库**。做这条等于修改那条隐私红线，必须先重开 spec 决定「存什么」：
  - 选项 A：只存灵的解读 + `summarizeSpiritMemory` 式的梦摘要（不存原文，与现有红线一致）
  - 选项 B：存原文但显式告知 + 提供删除（红线变更，要改 spec §5 与 §7「明确不做：梦境日记」那条）
  「可追问」需要把解梦从一次性 buffered 调用改成带上下文的多轮——与 `streamSpiritChat` 的形态趋同，可考虑复用而非新建。

- [ ] **[EP-nav-label] 导航「境」小字改「风水」**——`lib/i18n/messages/zh.ts` `nav.fengshui: "境"` → `"风水"`（大字 char「境」不变，见 `AppShell.tsx:19`）。⚠️ 同步看 `en.ts` 的 `nav.fengshui: "Space"` 是否也要跟着调整语义；另 `app/page.tsx` 的 `TG_ENTRIES` 是另一处硬编码入口（CLAUDE.md 记过「加功能必须改两处」的教训），改文案时一并核对。

- [ ] **[EP-motion] 强化过场动效**——owner 认可现有「正在推算当日流日…」那类排盘过场（`CastingOverlay`）的质感，希望扩大使用面。需要先盘一遍哪些等待场景值得加（解读生成/解梦/风水报告都是秒级 LLM 等待），避免变成到处转圈。

- [ ] **[EP-motion-bell] 首页与主菜单风铃图标增强动态**——`BellLogo` 已有 `idle` 参数（`components/ui.tsx:18`），但动效很弱。首页卷首与底部导航两处都要，注意底部导航是高频可见元素，动效要克制、不能变成持续晃动干扰阅读；建议只在首次进入/点击时触发一次摆动。

## 🟡 MED
- [ ] **[EP-account2-debt] 开场白计量 × SpiritPanel 每次挂载重生成且不持久化**——开 30 次 /chart 可烧光月度额度；BILLING_ENABLED 关闭时休眠，开收费前必修（intro 结果持久化或挂载去重）。
- [ ] **[EP-account2-debt] chat 路由请求体无校验**——chart/memory/questionnaire 字段无校验/无长度上限；计量封住了成本但没封提示注入面。
- [ ] **[EP-account2-debt] TG cookie 解析第三份收敛**：EP-account2 已把 `api/fengshui/reading` / `billing/status` 的内联 cookie 解析收敛进 `resolveUid`（3→2 份），最后一份在 `GET /api/tg/session` 路由内联——它要 exp/uid 等 session 字段做续期判断，而 `resolveUid` 只返回 uid。待 `resolveUid` 扩返回 session 字段后顺手收敛。
- [ ] [EP-profile-q] 建档交互式心理问卷：起盘流程插入若干心理学问题（自我认知/关系/动机倾向），结果并入 LLM 解读上下文以完善分析（与命盘事实互证，标注主观自陈 vs 命盘客观）。降低起盘摩擦：可「先出盘、后渐进追问」。
- [ ] [EP-ui-v2-rest] UI v2 素白收尾（主体已上线，剩余增项）：① 解读页 Tab 化（命理/心理/共振 sticky Tab + 摘要先行：大宋体结论 + 关键词 chips）② 命之书封面（海水江崖 + 竖排宋体）+ 桌面双栏运势/周历条 web 布局 ③ 进度条 + 命盘 hero 高亮弧随 Tab 旋转。设计参考 `design/zhaojian_ui_v2`。
- [ ] [EP-cal-img-2] 运势配图扩库：用 `curate-fortune-images` skill 扩充图库（每情绪 ≥4 张增变化、加季节维度）；样本足够后把筛图从人工转 agent reviewer 自动化。
- [ ] [EP-theme] 三套基调皮肤切换（data-theme：素白/国潮/青绿，仅换 accent）。
- [ ] [EP-auth] 账号升级：匿名登录 → 邮箱/手机正式登录（跨设备同步档案；当前匿名按设备隔离）。

## 🟢 LOW
- [ ] [EP-009] 分享卡片 / 海报生成。
- [ ] [EP-004c2] 四化错配残留：现已确定性后置纠正（删错误「X化X」），可选再评估换 DeepSeek 对照分。

## 📋 研究向（未决策）
- [ ] 关系合盘（synastry × 紫微合婚）。
- [ ] 规则引擎 vs 纯 Prompt 约束的边界（见 fortune-engine tech-report Dual-Route）。
- [ ] 心理占星「准临床」内容的合规边界。
- [ ] 时序解读再深化：大限/流年叠西方行运、时序声部更厚（基础版已上线，见 ✅ EP-timeline）。

## ✅ 已完成
- Sprint 001：双体系调研、产品/架构/UI 设计、脚手架。
- EP-001：Next.js App Router + Vercel；apps/web + @eamvp/core 集成。
- EP-002/002b/003：三引擎（八字 lunar-typescript + 紫微 iztro + 西方 circular-natal-horoscope-js）+ normalizeBirth + computeUnifiedChart；core 14/14。
- EP-004：@eamvp/llm 可插拔解读层（双线协议，默认 MiniMax-M3 Coding Plan）+ 三声部 + 守护栏 + 流式。
- EP-004-eval / 004b / 004c：接地性 eval（scorer + 20 例 + runner）；西方越界净化 sanitizeReading；四化确定性纠正 correctMutagens（引擎四化 20/20 与标准表一致，错配纯模型）。llm 26/26。
- EP-MODELS：三模型对比（docs/llm-model-comparison.md）→ 维持 MiniMax-M3（首字 2.4s）。
- EP-006：照见设计系统全站（令牌/宋体/宣纸 + UI 原语 + 响应式导航 + 全中文 + LLM 中文）。
- EP-005：4 图谱（BaziPillars/ZiweiBoard/NatalWheel/WuxingRadar）+ 命盘工作台 + 三段式解读卡。
- EP-007 + EP-007b：基础八字排盘 + 档案；出生地地名→经纬度/时区（Nominatim + tz-lookup）。
- EP-008：运势日历（computeDailyFortune：流日×命主十神 + 黄历宜忌 + 五维评分 + 趋吉避祸）。
- EP-DB：档案切 Supabase（项目 zhaojian，匿名登录 + RLS，命盘冻结触发器，reading 持久化列）。
- EP-DEPLOY：上线 Vercel（GitHub 集成自动部署，framework=nextjs + RootDir=apps/web）。
- EP-v2：起盘 UX（地名/时辰）+ 西方盘重绘 + 解读显眼 CTA + 解读持久化（一次生成不重算）。
- EP-engine-v2：引擎深化（spec `docs/specs/engine-v2-deepening.md`，TDD，core 45+llm 30）。命理深度：旺衰证据化(502)+用神(501)+三方四正(503)+流日×本命冲合(504)+西方画像(505)，接入 facts/prompt/日历，实跑验证落地无幻觉。工程：prompt缓存(511)+重试超时(512)+西方校验(513)+接地观测(514)。演进：紫微大限流年(521)+Placidus(522) 引擎就绪。
- EP-002-cal：排盘精度——真太阳时含均时差 EoT；晚子时归日 `ziHourConvention`→lunar sect（默认 current 保持既有）；跨节气/立春金标准测试；日主旺衰启发式（替代 unknown）。core 22/22。
- EP-cal-llm：运势日历轻润色一句（`polishDailyFortune`，照见声部、非决定论、≤38 字），按 (档案,日期) localStorage 缓存避免重复调 LLM。实跑验证。
- EP-cal-img：运势配图（A 混合制）。MiniMax image-01 预生成纯水墨图 → 人工筛图(20 张) → 打意境标签存 `public/fortune/` + 清单 `lib/fortune-images.ts` → `matchFortuneImage` 按当日十神情绪规则选图。筛图流程做成 skill `curate-fortune-images`。
- EP-cal-v2（竞品参考）：运势日历升级——框景配图、大字总评、五行配色干支、心理行为版宜忌（`dailyBehaviorAdvice`）。
- EP-timeline：时序层接入产品——`computeZiweiHoroscope` 大限/流年四化 → 时序声部 `generateTimeline`（非事件预测）→ /chart「当下时序」卡（按年缓存）+ /calendar「本年/本限」上下文条 + 每日流日×本命互动。
- EP-fixes：解读 markdown 渲染（`Markdown` 组件）；西方本命盘连线重绘（相位锚到真实位置点 + 腿连符号，去合相零长线）；解读内部数据泄漏修复（facts 砍原始数值 + prompt 禁元指令）；三段式流式书写感（客户端 rAF 打字机，标点停顿）。
- EP-logo：铜铃 logo 组件 `BellLogo`（风过则动微摆）。
- **EP-ui-v2：UI 全面现代化「素白」**（设计规范 `design/zhaojian_ui_v2`）。令牌（冷调素白/正文无衬线·标题宋体/大圆角/柔阴影）+ 完整动效语言（zjRise/zjPop/zjBell/zjSpinSlow + 缓动 + reduced-motion）+ 新组件（BellLogo/HeroWheel/ScoreRing/CastingOverlay）+ 导航（素白左栏 + 毛玻璃底栏 + 激活朱方块）+ 首页 hero（氛围大图 + 自转命盘环 + 入口网格）+ 运势 hero（评分环 + 每日配图作背景）+ 测算过场动画 + 起盘/档案/命盘全站素白。Playwright 桌面+移动验证。剩余增项见 🟡 EP-ui-v2-rest。
