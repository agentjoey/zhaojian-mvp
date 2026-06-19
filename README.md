# Eastern-Astrology-MVP

> 东方命理（八字 + 紫微斗数）× 西方心理占星（利兹·格林学派）双引擎个人成长 App。
> 输入出生信息 → 自动排盘 → **命理分析 + 心理分析 + 成长建议**。

**差异化一句话：** *命理给结构，心理给意义* —— 把命盘当作「心理投射界面」而非预测神谕，东西方双盘互证，输出反思性、非决定论的自我认知与成长建议。

## 文档地图
| 类别 | 位置 |
|------|------|
| Agent 工作台 | `.agent/CURRENT.md`（状态）· `.agent/BACKLOG.md` · `.agent/sprints/` |
| 技术上下文 | [CLAUDE.md](CLAUDE.md) |
| 架构 / 部署 / 运维 | [docs/architecture.md](docs/architecture.md) · [docs/deployment.md](docs/deployment.md) · [docs/operations.md](docs/operations.md) |
| 架构决策 | [docs/decisions/](docs/decisions/) |
| 调研 / PRD / 设计 | Obsidian `Brain#2/10_Projects/Active/P028-EasternAstrology/` |

## 现状
v0.1.0 — 立项调研 + 产品/架构/UI 设计 + 脚手架。**Web 框架待 ADR-001 拍板**（Next.js 推荐 vs Bun+Hono）。

## 开发（框架确定后补全）
```bash
pnpm install
pnpm test          # 排盘核心单测
./scripts/release.sh [patch|minor|major]
```

## 免责声明
本产品仅作传统文化与心理学的现代化研究与自我探索工具，所有解读仅供参考与自我反思，不构成医疗、法律、财务或心理诊断建议。
