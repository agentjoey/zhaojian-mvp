# Product Backlog — Eastern-Astrology-MVP（照见 Zhaojian）
> 排入 Sprint 后从此处移除。详见 Obsidian `P028-EasternAstrology/PRD.md`。

## 🔴 HIGH
- [ ] [EP-DB] [HIGH] 档案存储切 DB（**建议 Supabase**：账号 + 跨设备同步 + 出生数据 RLS）；唯一替换点 `apps/web/lib/profiles.ts`

## 🟡 MED
- [ ] [EP-002-cal] [MED] 排盘金标准校验：均时差 EoT、早/晚子时归日、跨节气月柱，对照官方计算器；八字旺衰/用神（dayMasterStrength 现为 unknown）
- [ ] [EP-cal-llm] [MED] 运势日历可选「轻 LLM 润色一句」（确定性评分之上，缓存友好）
- [ ] [EP-007b] [MED] 出生地搜索 → 经纬度（替代手填 lat/long）
- [ ] [EP-theme] [MED] 三套基调皮肤切换（data-theme：宣纸/国潮/青绿，仅换 accent）

## 🟢 LOW
- [ ] [EP-009] [LOW] 分享卡片 / 海报生成
- [ ] [EP-logo] [LOW] 檐角铜铃 logo 组件 + 篆书印章字形（当前用宋体 700 占位）

## 📋 研究向（未决策）
- [ ] 关系合盘（synastry × 紫微合婚）
- [ ] 规则引擎 vs 纯 Prompt 约束的边界（见 fortune-engine tech-report Dual-Route）
- [ ] 心理占星「准临床」内容的合规边界
- [ ] 大限/流年时序解读（现仅本命盘 + 流日运势）

## ✅ 已完成（按 Sprint 归档）
- Sprint 001：双体系调研、产品/架构/UI 设计、脚手架初始化（详见 sprint-001.md）
- EP-001：Web 框架定稿（Next.js App Router + Vercel，ADR-001 Accepted）+ `apps/web` 初始化 + `@eamvp/core` 集成
- EP-002/002b/003：三引擎落地（八字 lunar-typescript + 紫微 iztro + 西方 circular-natal-horoscope-js）+ `normalizeBirth` + `computeUnifiedChart`；core 测试 14/14
- EP-004：`@eamvp/llm` 可插拔解读层（双线协议 anthropic/openai，默认 MiniMax-M3 Coding Plan）+ 三声部 + 守护栏 + 流式；llm 测试 13/13，真实 MiniMax-M3 跑通
- EP-006：「照见」设计系统全站落地（令牌/宋体/宣纸 + UI 原语 + 响应式导航 + 中文 + LLM 中文输出）
- EP-005：4 图谱组件（BaziPillars/ZiweiBoard/NatalWheel/WuxingRadar）+ 命盘工作台 `/chart` + 三段式解读卡
- EP-007：基础八字排盘 + 档案（起盘→一次生成→localStorage 冻结）+ `/profiles`
- EP-008：运势日历 `/calendar`（`computeDailyFortune` 确定性：流日×命主十神 + 黄历宜忌 + 五维评分 + 趋吉避祸）
- EP-004-eval：解读接地性 eval（`@eamvp/llm/eval`：scorer 接地/四化/守护栏/格式 + 20 例语料 + 实跑 runner + scripts/run-eval.ts）；llm 测试 20/20。**实跑发现**：MiniMax-M3 基线 9/20 pass（紫微/七杀 name-drop 8 例 + 无时辰却杜撰西方行星 2 例）→ 修复：`extractFacts` 补全 12 宫主星 + prompt 强化反幻觉/西方降级 → 复测见 CURRENT
