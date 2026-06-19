# Product Backlog — 照见 Zhaojian（zhaojian-mvp）
> 线上 https://zhaojian-mvp.vercel.app · 排入 Sprint 后从此处移除。

## 🔴 HIGH
- （暂无 —— MVP 主链路已上线：起盘→命盘→解读→运势→档案，全部生产可用）

## 🟡 MED
- [ ] [EP-profile-q] 建档交互式心理问卷：起盘流程插入若干心理学问题（自我认知/关系/动机倾向），结果并入 LLM 解读上下文以完善分析（与命盘事实互证，标注主观自陈 vs 命盘客观）。降低起盘摩擦：可「先出盘、后渐进追问」。
- [ ] [EP-cal-img-2] 运势配图扩库：用 `curate-fortune-images` skill 扩充图库（每情绪 ≥4 张增变化、加季节维度）；样本足够后把筛图从人工转 agent reviewer 自动化。
- [ ] [EP-theme] 三套基调皮肤切换（data-theme：宣纸/国潮/青绿，仅换 accent）。
- [ ] [EP-auth] 账号升级：匿名登录 → 邮箱/手机正式登录（跨设备同步档案；当前匿名按设备隔离）。

## 🟢 LOW
- [ ] [EP-009] 分享卡片 / 海报生成。
- [ ] [EP-logo] 檐角铜铃 logo 组件 + 篆书印章字形（当前用宋体 700 占位）。
- [ ] [EP-004c2] 四化错配残留：现已确定性后置纠正（删错误「X化X」），可选再评估换 DeepSeek 对照分。

## 📋 研究向（未决策）
- [ ] 关系合盘（synastry × 紫微合婚）。
- [ ] 规则引擎 vs 纯 Prompt 约束的边界（见 fortune-engine tech-report Dual-Route）。
- [ ] 心理占星「准临床」内容的合规边界。
- [ ] 大限/流年时序解读（现仅本命盘 + 流日运势）。

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
- EP-cal-img：运势配图（A 混合制）。MiniMax image-01 预生成纯水墨图 → 人工筛图(首批 10/10 通过) → 打意境标签存 `public/fortune/` + 清单 `lib/fortune-images.ts` → `matchFortuneImage` 按当日十神情绪规则选图（确定性、同日稳定）。日历展示水墨横幅 + 心理暗示文案。筛图流程做成 skill `curate-fortune-images`（首期人工、后续转 agent reviewer）。
