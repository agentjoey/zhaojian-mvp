# Eastern-Astrology-MVP — Claude Code Context

## ⭐ Session 启动（每次必执行）
```bash
git fetch origin 2>/dev/null && git status -sb   # behind → git pull
cat .agent/CURRENT.md                             # 版本 / Sprint / Open Bugs
# 需任务细节：cat .agent/sprints/sprint-001.md
```

## Project Overview
东方命理（八字 + 紫微斗数）× 西方心理占星（利兹·格林学派）双引擎个人成长 App。
用户输入出生信息 → 自动排盘 → **命理分析 + 心理分析 + 成长建议**。
差异化：把「命理预测」重构为「心理自我认知 + 成长陪伴」，东西方双盘互证。

**Location:** ~/AgentWorks/CodeSpace/eastern-astrology-mvp
**Obsidian:** Brain#2/10_Projects/Active/P028-EasternAstrology（PRD / research / design / ADR）
**GitHub:**   agentjoey/eastern-astrology-mvp（待建）
**Version:**  v0.1.0            ← release.sh 自动更新

**Technical docs:** [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Operations](docs/operations.md)
**前序资产:** Obsidian `research/fortune-engine-{prd,plan,tech-report}.md`（八字+紫微基础方案，本项目在其上叠加心理占星层）

## Tech Stack（ADR-001 已定 ✅）
| Layer | Tech | 状态 |
|-------|------|------|
| Web 框架 | **Next.js 16 App Router (TS)** + React 19 + Tailwind 4 | ✅ `apps/web` 已建 |
| 部署 | **Vercel**（无 DB / 无账号；匿名解读，命盘按需重算）| ✅ |
| 八字排盘 | lunar-typescript (MIT) | ✅ 已定 |
| 紫微排盘 | iztro (MIT) | ✅ 已定 |
| 西方星盘 | circular-natal-horoscope-js（公有领域，规避 Swiss Ephemeris AGPL）| ✅ 已定 |
| 校验 | Zod | ✅ 已定 |
| LLM 解读 | **可插拔（OpenAI 兼容）**，默认 **MiniMax-M3**，env 可切 DeepSeek/任意兼容端点 | ✅ `@eamvp/llm` 已建 |

**首发市场：海外**（华裔 + 西方探索者，英文 UI 优先）。产品正式名待定，代号 `astrology-mvp`。

## Key Implementation Details（仅记非显而易见的陷阱/约定）
- **排盘不许 LLM 算**：星曜/宫位/四化/四柱一律由 iztro+tyme4ts 计算，LLM 只解释，杜绝幻觉。
- **真太阳时**：出生地经度 → 时差校准；早晚子时（23:00–01:00）跨日，按规范测试用例验证。
- **东西双盘互证**：紫微「命宫/福德宫」≈ 心理占星「自我/内在世界」；禁止强行 1:1 映射，详见 research。
- **心理占星 ≠ 临床心理**：文案须反思性、非决定论、成长导向；强制免责声明。
- **核心库零数据重叠**：lunar-typescript（八字）与 iztro（紫微）数据层互补，已建统一 `UnifiedChart` Schema（`packages/core/src/types/chart.ts`）。
- **iztro v2.5.8 配置 API**：`astro.config({ algorithm: 'default'|'zhongzhou' })`（**非** 旧版 `configure({mutagen})`，research 笔记里的旧 API 已失效）；默认 `zhongzhou`。
- **iztro `timeIndex` 0–12**：00–00:59=子(0)…14:30=未(7)…23:xx=晚子(12)；用 `hourToTimeIndex()`，勿传小时。
- **三引擎共用 `normalizeBirth()`**：真太阳时（经 IANA 时区自动含历史 DST）+ 农历转换 + 时辰索引，保证四柱/星盘时刻一致。真太阳时仅平太阳时近似（未含均时差 EoT，记入 EP-002）。

## Dev Commands
```bash
pnpm install
pnpm --filter @eamvp/web dev        # 本地起 Next 应用（http://localhost:3000）
pnpm --filter @eamvp/web build      # 生产构建（含 TS 校验）
pnpm --filter @eamvp/core test      # 排盘核心单测（边界/跨节气/子时/真太阳时）
./scripts/release.sh [patch|minor|major]
```
**Monorepo:** `apps/web`（Next）+ `packages/core`（排盘）+ `packages/llm`（解读，均经 `transpilePackages` 接入）。
集成边界：`apps/web/app/reading/actions.ts`（→ core 排盘）、`apps/web/app/api/reading/route.ts`（→ llm 流式解读）。
**LLM 解读层（`@eamvp/llm`）：** provider 无关 fetch 客户端，**双线协议**：`anthropic`（Messages `/v1/messages`）/ `openai`（`/chat/completions`），env 驱动（`LLM_PROVIDER`/`LLM_MODEL`/`LLM_BASE_URL`/`LLM_API_KEY`[/`LLM_WIRE`]）。
- **默认 = MiniMax-M3 Coding/Token Plan = Anthropic 兼容**：base `https://api.minimax.io/anthropic`，端点 `/v1/messages`，`Authorization: Bearer <sk-cp…>` + `anthropic-version`，body 顶层 `system`+`messages`+`max_tokens`，SSE 用 `content_block_delta…message_stop`。兼容读取 `ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_BASE_URL`。
- DeepSeek 等走 `openai` 线协议。
- 三声部提示（命理/心理/整合）+ 守护栏从 core `SYNTHESIS_GUARDRAILS`/`RESONANCE_ANCHORS` 取；输出契约 **markdown 四分节**（不依赖 json_schema）。反幻觉：只喂 `extractFacts(chart)` 承重事实，禁模型自行排盘。

## 本地实测解读（需自备 MiniMax Coding/Token Plan key, sk-cp…）
> ⚠️ Web 端口固定 **3030**（端口 3000 被本机 Hermes WhatsApp bridge 长期占用，故避开）。
```bash
LLM_API_KEY=sk-cp-... pnpm --filter @eamvp/web dev   # → http://localhost:3030 ，/reading 点「Generate full reading」
# 或直接打 API：
curl -s -X POST localhost:3030/api/reading -H 'content-type: application/json' \
  -d '{"date":"1991-03-15","time":"14:30","gender":"male","latitude":31.23,"longitude":121.47}'
```

## Release 后必做（任何 agent 通用）
1. `.agent/CURRENT.md`：补充 Version History 描述 + 更新 Last Updated agent-id
2. 更新 Current Sprint Summary
3. 如有架构变更：更新 `docs/architecture.md`

## Superpowers Checkpoints（强制）
| 阶段 | Skill |
|------|------|
| 新功能/Sprint 规划前 | `superpowers:brainstorming` |
| 遇 Bug / 意外行为 | `superpowers:systematic-debugging` |
| 标 ✅ Done 前 | `superpowers:verification-before-completion` |

<!-- pact:begin (managed by pactify — edit outside this block) -->
# pact protocol — seat `claude`

This repo uses the **pact protocol** (v1). You are seat `claude`, roles: orchestrator,reviewer,worker.

**Primary — MCP:** the `pact` MCP server is wired into your config. Use its tools
(status / join / assign / checkpoint / accept / changes / merge / list) and resources
(`pact://state`, `pact://log`). Cold start: call `status`, then `join`
(registers your seat and checks out your feature branch).

**Fallback — shell** (if MCP is unavailable):
```bash
export PACT_AGENT_ID=claude
pactify join claude --roles orchestrator,reviewer,worker
```
then `pactify help` for the verbs.

**The two rules:** a worker cannot self-accept (only the task's reviewer accepts); a
feature cannot merge until all its tasks are accepted.
<!-- pact:end -->
