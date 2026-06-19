# ADR-001：技术栈与 Web 框架选型

- **状态：** ✅ Accepted（用户 2026-06-18 拍板）
- **日期：** 2026-06-18
- **决策者：** 用户（最终）· claude-opus-4-8（建议）
- **关联：** `research/technical-research.md`，前序 `research/fortune-engine-tech-report.md`

## 背景
MVP 需把出生信息 → 八字+紫微+西方本命盘 → LLM 命理/心理/建议。已确定的不变项：
- 八字 `lunar-typescript`、紫微 `iztro`、西方盘 `circular-natal-horoscope-js`、校验 `zod`、LLM `Claude`（Opus 4.8）——**均为 TypeScript/JS，跑在 Node**。
唯一待决：**Web/部署框架**。

## 选项
### 选项 A（推荐）：Next.js App Router (TS) + Vercel
- ✅ 计算层全是 JS/TS，单一 TS 代码库即可承载 计算 + LLM + UI。
- ✅ Vercel 原生（Fluid Compute、AI Gateway、AI SDK 一方支持）；Server Action 内排盘+调 LLM，密钥不出端。
- ✅ `react-iztro` 直接渲染命盘；前后端同语言、类型共享。
- ✅ MVP 无需 DB/账号；后续接 Vercel Marketplace(Neon/Supabase) 平滑。
- ⚠️ 与前序 fortune-engine 文档（Bun+Hono）不一致——需明确改向。

### 选项 B：Bun + Hono 单体后端 +（SvelteKit/Next）前端
- ✅ 前序文档既有方案；Bun 启动快、本地部署简单。
- ⚠️ 与 Vercel 生态契合度低；前后端分离增加运维；AI SDK/Gateway 非一方。
- 来源：`fortune-engine-tech-report.md`（当时环境已有 Bun，故推荐）。

### 选项 C：Python(FastAPI) 后端 + JS 计算
- ❌ 必须为 JS 计算层 shell-out 或在 Python 重写紫微/八字（无成熟 Python ziwei 库）；除非需 Swiss Ephemeris（本 MVP 不需）。

## 决策（已定）
**选 A：Next.js App Router (TS) + Vercel。** 用户 2026-06-18 确认。配套决定：
- **MVP 不引入 DB / 账号** —— 命盘为出生信息纯函数，按需重算；匿名解读。
- **产品正式名待定，暂用代号 `astrology-mvp`。**
- **首发市场：海外**（华裔 + 西方探索者；监管路径更干净、英文 UI 优先）。

## 影响（已落地）
- `apps/web` 已用 `create-next-app`（Next 16 / React 19 / Tailwind 4）初始化并加入 `pnpm-workspace.yaml` 的 `apps/*`。
- `@eamvp/core` 经 `transpilePackages` 接入；server action `app/reading/actions.ts` 已打通校验→排盘集成边界。
- 验证：`pnpm --filter @eamvp/web build` ✓ 编译+TS 通过（路由 `/`、`/reading`）；`@eamvp/core` 测试 4/4。
- `packages/core` 内部相对导入改为 extensionless（Turbopack 不重映射 `.js`→`.ts`）。
- `docs/deployment.md` 待随首个 Vercel 部署补全。
