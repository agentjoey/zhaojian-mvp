# Current Status — Eastern-Astrology-MVP

Version:        v0.1.0
Sprint:         001
Sprint Status:  🔄 In Progress
Last Updated:   2026-06-18 by claude-opus-4-8
Sprint File:    .agent/sprints/sprint-001.md

## Open Bugs（P0/P1 必须本 Sprint 修复）
🟢 无已知 P0/P1 bug。
📌 待解（非阻塞，记入 EP-002 金标准校验）：
  - 真太阳时仅平太阳时近似，未含均时差 EoT（±~16min），可能影响临界时辰。
  - 早/晚子时归日采用 lunar 默认 sect，精确约定待对照官方计算器。
  - 八字旺衰/用神判定（dayMasterStrength 现为 'unknown'）留待 EP-004。
🎨 UI 小项（留 UI 打磨）：移动端表单宽度溢出；React 19 form action 提交后自动清空非受控输入。

## Current Sprint Summary
Sprint 001（调研+设计+脚手架）三大任务 T1/T2/T3 **均 ✅ Done**：
①双体系+竞品+技术调研 4 篇（Obsidian `research/`，带引用）②融合产品思路 PRD + 架构 + DESIGN/用户流 + ADR-001 ③按 orchestration-spec v2.0 完成代码仓脚手架 + Obsidian P028 目录 + `packages/core` 排盘骨架（统一 Schema + 东西共振映射表），`vitest` 4/4 通过、iztro/lunar 冒烟通过。
前序 fortune-engine PRD/plan/tech-report 已纳入复用基线。
**EP-001 已完成**：ADR-001 拍板 Next.js App Router + Vercel（无 DB/账号、海外首发、代号 astrology-mvp）；`apps/web`（Next 16/React 19/Tailwind 4）落地，含落地页 + `/reading` 表单 + server action 打通 `@eamvp/core`。
**EP-002/002b/003 已完成**：三引擎全部落地（八字 lunar-typescript + 紫微 iztro + 西方 circular-natal-horoscope-js），共用 `normalizeBirth`（真太阳时/农历/时辰索引），`computeUnifiedChart` 组装并 Zod 校验。验证：`@eamvp/core` 测试 **14/14**（年柱/日主/五行计数/12宫/生年四化/十星/Sun双鱼/立春边界/子时/降级）；`pnpm --filter @eamvp/web build` ✓；Playwright 驱动 `/reading` 端到端实测渲染真实命盘。**EP-004 已完成**：`@eamvp/llm` 可插拔解读层，**双线协议**（anthropic / openai），env 可切。
⚠️ **复核修正**：MiniMax-M3 的 **Coding/Token Plan 走 Anthropic 兼容线**（非最初对的 OpenAI 兼容）——base `https://api.minimax.io/anthropic`、端点 `/v1/messages`、`Bearer sk-cp…`(+`anthropic-version`)、body 顶层 `system`、SSE `content_block_delta…message_stop`。已据此重构 provider/client，默认 MiniMax→anthropic 线；DeepSeek 仍走 openai 线。
承重事实抽取(反幻觉) + 三声部提示(命理/心理/整合) + 守护栏(取自 core) + markdown 四分节 + 流式；`/api/reading` 流式路由 + 结果页「Generate full reading」流式渲染。验证：llm 测试 **13/13**（本地 stub 同时验证 anthropic 与 openai 两线的请求/鉴权/system提取/SSE 解析）、web build ✓。**实跑需用户自备 MiniMax Coding/Token Plan key（sk-cp…）**。
下一步 EP-005（三段卡片精修 + markdown 渲染 + react-iztro 命盘 + 接地性 eval）。

## Next Sprint Candidates
- [x] [EP-001] [HIGH] ✅ Web 框架 = Next.js App Router + Vercel（ADR-001 Accepted）；`apps/web` 已初始化并接入 `@eamvp/core`，build+TS 通过
- [x] [EP-002] [HIGH] ✅ packages/core 八字引擎（lunar-typescript：四柱/十神/藏干/五行计数/大运 + `normalizeBirth` 真太阳时/农历/时辰索引）
- [x] [EP-002b] [HIGH] ✅ packages/core 紫微引擎（iztro v2.5.8：12宫/主辅杂耀/生年四化/亮度，`astro.config({algorithm})`）+ `computeUnifiedChart` 组装
- [x] [EP-003] [HIGH] ✅ 西方本命盘（circular-natal-horoscope-js：十星/星座/宫位/相位+硬软质分类/上升中天；时辰或经纬缺失则降级 null）
- [x] [EP-004] [HIGH] ✅ `@eamvp/llm` 双声部解读层（provider 无关 OpenAI 兼容，默认 MiniMax-M3，可切 DeepSeek）：承重事实抽取 + 三声部提示 + 守护栏 + markdown 四分节 + 流式；`/api/reading` 流式路由 + 结果页流式渲染。⏳ 实跑需自备 LLM_API_KEY
- [x] [EP-006] [HIGH] ✅ 「照见」设计系统落地：tokens/fonts/globals + UI 原语(Button/Card/Tag/MutagenTag/GanzhiBadge/SealIcon) + 全站重做(宣纸/宋体/朱墨,全中文,响应式) + LLM 中文输出 + 响应式导航(桌面侧栏/手机底栏)
- [x] [EP-005] [HIGH] ✅ 4 图谱组件(BaziPillars/ZiweiBoard/NatalWheel/WuxingRadar,受 UnifiedChart,trig 几何) + 命盘工作台 `/chart` + 三段式解读卡(命理 fire/心理 water/成长 metal)
- [x] [EP-007] [HIGH] ✅ 「基础八字排盘」+ 档案：起盘→`computeChartAction`→`createProfile`(localStorage 冻结)→`/chart`；`/profiles` 档案管理。**后续切 Supabase**(出生数据需 RLS,见建议)
- [x] [EP-008] [HIGH] ✅ 「运势日历」`/calendar`：`computeDailyFortune`(core,确定性:流日干支×命主十神关系 + 黄历宜忌) → 五维评分 + 趋吉避祸 + 本周日历条
- [x] [EP-004-eval] [HIGH] ✅ 解读接地性 eval（`@eamvp/llm/eval`）：scorer（接地/四化错配/越界/守护栏/格式，纯函数）+ 20 例语料 + 实跑 runner + `scripts/run-eval.ts`；llm 测试 **20/20**。
  实跑 MiniMax-M3 **before 9/20 → after 13/20**（2 例 fetch failed 为网络非质量）：
  - ✅ 修复：紫微/七杀 name-drop（8→0）—— `extractFacts` 补全 12 宫主星 + prompt 强化。
  - 📌 待修：① 无时辰仍部分杜撰西方行星（westernLeak 5-6→3，prompt OMIT 未根治，需后置过滤）② 新 四化错配检出 ~3 例（MiniMax 偶把「X化忌」配错星）。两项记下方。
- [~] [EP-004b] [MED] 收紧解读（实跑 MiniMax-M3，三轮渐进 9→13→17→现 14-17/20 浮动）：
  - ✅ **西方越界已硬修**：`sanitizeReading` 后置净化（western=null 时心理段整段替换为固定提示）+ 流式降级缓冲；无时辰两例已稳定 pass。
  - ✅ 紫微/七杀 name-drop 已修（allPalaces）。四化醒目化 + prompt 强化（禄/权/科/忌 显式配对）。
  - 📌 **残留＝模型非确定性**：四化错配（MiniMax 仍会编造「紫微化忌」等无效配对，每轮中招用例不同，是头号残留）+ 偶发 注定/必将。prompt 只能压不能根治。
  - 单测 21/21；scorer 已能稳定检出四化错配/越界/幻觉/违规/缺段（确定性）。
- [x] [EP-004c] [HIGH] ✅ 四化确定性后置纠正 `correctMutagens`（删错误「X化{禄/权/科/忌}」断言、留星名，只删不替）：非流式全文纠 + 流式按行纠（保首字速度）+ western 净化。实跑 6/6 通过、四化错配=0。单测 26/26。引擎四化已验证 20/20 与标准表一致（错配纯模型问题，非引擎）。
- [x] [EP-MODELS] ✅ 三模型对比（`docs/llm-model-comparison.md`）：M3 首字 2.4s 胜；m2.7-highspeed 31.7s 否决；deepseek-v4-flash 11.9s 合格备选。维持 M3。
- [x] [EP-DB] [HIGH] ✅ 档案切 Supabase（项目 `zhaojian`/sxjcpoxhphlnwhpzachi，匿名登录+RLS）：`profiles` 表+RLS（select/insert/delete，无 update=冻结，user_id 默认 auth.uid()）、advisor 0 警告；`lib/supabase.ts`+`lib/profiles.ts`+4 调用点 await。匿名登录已开。**REST 实证**：A 见己 / B 见 `[]`（RLS 隔离）。
- [x] [EP-DEPLOY] [HIGH] ✅ **上线 https://zhaojian-mvp.vercel.app**（GitHub 集成自动部署）。根因：Root Directory=apps/web ✓ 但 framework=null 致全 404 → token 设 framework=nextjs + 重部署修复。实证 `/reading` 200、`/api/reading` 400(key 已设)。详见长期记忆 deployment-infra。
- [x] [EP-v2] [HIGH] ✅ 上线优化（commit f0c63a7，生产已验证）：① 自定义域名 `zhaojian.agentjoey.ai`(Vercel verified) ② 起盘 UX：地名→经纬度/时区(Nominatim+tz-lookup)、时辰实时显示+不知时辰开关 ③ 西方本命盘重绘(行星防撞/真实刻度/宫号/清爽中心)修复看不清 ④ 解读显眼 CTA + 一次生成后存档(Supabase reading 列)回访不重算(命盘冻结由触发器保) + 隐私文案如实化。Playwright 全验证。
- [ ] [EP-cal-img] [MED] 运势日历配图（backlog）
- [ ] [EP-profile-q] [MED] 建档交互式心理问卷（backlog）
- [ ] [EP-cal-llm] [LOW] 运势日历可选轻 LLM 润色一句

## Version History（最近 5 版）
| Version | Date | Summary |
|---------|------|---------|
| v0.1.0 | 2026-06-18 | 立项：双体系调研 + 产品/架构/UI 设计 + 脚手架初始化 |
