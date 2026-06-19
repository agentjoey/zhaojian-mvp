# Sprint 001

Goal:      立项调研 + 产品/架构/UI 设计 + 项目脚手架初始化（东方命理 × 西方心理占星双引擎 MVP）
Period:    2026-06-18 ~ 2026-06-25
Version:   v0.1.0
Assignee:  claude

## Tasks

### T1: 双知识体系 + 竞品 + 技术调研 [HIGH] [claude]
**Status:** ✅ Done
**Epic:** —
**Acceptance:**
- [x] `research/ziwei-doushu-knowledge.md` — 紫微斗数体系（12宫/14主星/四化/三方四正/解读法）✓ 已建（带 30+ 引用）
- [x] `research/liz-greene-psychological-astrology.md` — 利兹·格林心理占星体系 ✓ 含 9 条 analysis primitives + 东西桥接边界
- [x] `research/competitor-analysis.md` — 测测/fatetell/Co-Star/The Pattern 等竞品 + 白地分析 ✓ 含融合白地结论
- [x] `research/technical-research.md` — iztro/lunar/西方星盘库/LLM/技术栈选型对比与推荐 ✓

### T2: 产品思路 + 架构 + UI 设计 [HIGH] [claude]
**Status:** ✅ Done
**Epic:** —
**Acceptance:**
- [x] `PRD.md` — East×West 融合 MVP 产品需求（输入→双盘排算→命理+心理+建议）✓
- [x] `docs/architecture.md` — 系统架构（排盘核心 / LLM 双声部 / 数据流 / 共振守护栏）✓
- [x] `design/DESIGN.md` + `design/user-flows/core-reading-flow.md` — 信息架构、核心用户流、UI 设计语言 ✓
- [x] `decisions/ADR-001-tech-stack.md` — Web 框架决策（Next.js 推荐 vs Bun+Hono）✓ Proposed

### T3: 脚手架初始化（orchestration-spec v2.0）[HIGH] [claude]
**Status:** ✅ Done
**Epic:** —
**Acceptance:**
- [x] 代码仓：CLAUDE.md / GEMINI.md(symlink) / AGENTS.md(symlink) / .agent/{CURRENT,BACKLOG,sprints} / docs/{architecture,deployment,operations,decisions,specs} / .claude/settings.json(PostBash Hook) / scripts/release.sh(可执行) ✓
- [x] Obsidian P028：research / design / decisions / archive 目录 + PRD ✓
- [x] packages/core 排盘骨架 + 统一 Schema（BirthInput/UnifiedChart/共振映射表）+ 单测 ✓ `vitest run` → 4 passed

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | 新设计前 | ✅（已与用户对齐交付深度/技术栈/输入模型）|
| verification-before-completion | Task Done 前 | ✅ `pnpm --filter @eamvp/core test` → 4 passed；iztro/lunar 冒烟通过 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾
**Done:** T1, T2, T3（调研 4 篇 + PRD/架构/DESIGN/ADR + 脚手架 + core 骨架，测试通过）
**关键发现（记入 EP-002）：** iztro `chineseDate` 与 lunar `getEightChar` 在月柱/时柱上约定不同（同一出生：年柱/日柱/日主一致，月时柱异），印证「统一 normalize 层 + 金标准交叉验证」的必要性。
**待用户决策：** ADR-001 Web 框架；产品命名；首发市场 A/B 顺序。
