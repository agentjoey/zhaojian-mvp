# Product Backlog — 照见 Zhaojian（zhaojian-mvp）
> 线上 https://zhaojian-mvp.vercel.app · 排入 Sprint 后从此处移除。

## 🔴 HIGH
- （暂无 —— MVP 主链路已上线：起盘→命盘→解读→运势→档案，全部生产可用）

## ⏸️ 已设计·MVP 后实施
- [ ] [EP-concurrency] 并发架构（多用户 & LLM 并发）。设计完成 `docs/specs/concurrency-architecture.md`。触发条件：接近 MiniMax 上限或峰值并发上升。MiniMax-M3 限额（官方查证）：**RPM 200 / TPM 10M**（TPS/并发未公布）→ RPM 200 是硬约束、TPM 不是瓶颈；MVP 不会触顶。落地序：Tier0(Fluid Compute+maxDuration+单飞) → Tier1(全局信号量/AI Gateway) → Tier2(异步队列+Realtime)。

## 🟡 MED
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
