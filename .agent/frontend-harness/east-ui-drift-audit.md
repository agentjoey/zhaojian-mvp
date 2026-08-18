# Task Capsule: 全站当代东方设计还原度审查（对照 .pen 截图）

Workflow: 3.2
Task: 对照 `docs/assets/zhaojian-eastern-ui.pen` 逐页审查线上 UI 与设计稿的差异并修复
Role: Primary Agent (claude，本会话)
Mode / rationale: Standard —— 既有 surface（首页/档案/境/流日/起盘/命盘）多页视觉还原，非新路由/无认证支付/无不可逆操作，不触发 Deep
Canonical record: .agent/frontend-harness/east-ui-drift-audit.md（本文件）
Branch / worktree: main（工作区改动，逐页小提交）
Mockup Gate: Skipped —— 设计已批准存在（.pen 文件即 approved revision），本任务是「实现对齐既有设计」而非「新设计方向」，不产生新歧义
Review path: 独立 Review+Verification（fork 或独立 subagent，非本 session 自我确认）
Human checkpoints: 逐页发现的结构性歧义（如首页是否保留东西共振卡片区）先问 Human Owner，不擅自删

## Capability gap（已记录，未静默绕过）
- Pencil MCP 文件读取 handler 全部 `No handler found for method`（get_editor_state/get_screenshot/snapshot_layout/batch_get），重试 5 次+用户在 Pencil App 内操作后仍未恢复。判定：本 session 连接未就绪，非可重试问题。
- 本 session 无浏览器自动化工具，无法截取线上页面。
- **等价证据路径（Human Owner 提供）**：用户直接从 Pencil 画布导出 6 张设计帧截图（首页/档案/境/流日/起盘/命盘），作为本轮审查的 ground truth。已收到，逐页比对。

## 页面清单与截图对应
| 设计帧 | 对应路由/组件 | 状态 |
|---|---|---|
| S1 首页·卷首 | `apps/web/app/page.tsx`（`!inTg` 分支） | ✅ 已改（footerBrand 落款 + ctaSecondary 文案），零行为改动仅文案/文本，未加测试 |
| 档案·命盘分人而立 | `apps/web/app/profiles/page.tsx` | ✅ 已改（副标题格式/SealIcon ink variant/首尾细线/新建档案入口），测试覆盖 `app/profiles/__tests__/page.test.tsx`（5 用例，含 SealIcon variant 变异实证） |
| 境·居所的方位 | `apps/web/app/fengshui/page.tsx`（chart tab） | ✅ 已改（决定 #4/#6：居所优先主视觉条件重排 + `deriveFengshuiTagline` 一句话基调 + 展开/收起），测试覆盖 `app/fengshui/__tests__/page.test.tsx` 新增 4 用例 + 全量回归修复，含变异实证（NarrativeStatus 回归 + tagline 硬编码） |
| 流日 | `apps/web/app/calendar/page.tsx` | ✅ 已改（决定 #7：判词提升主视觉、评分环降级为紧凑徽标，老黄历底部行未做），沿用既有判词词表零新计算逻辑 |
| 起盘·写下你的生辰 | `apps/web/app/reading/ReadingForm.tsx` | ✅ 已改（决定 #1：字段细线化 + 性别文字切换 + 时辰提示重排），测试覆盖 `app/reading/__tests__/ReadingForm.test.tsx`（3 用例，含变异实证） |
| 命盘·四柱+紫微 | `apps/web/app/chart/page.tsx` + `BaziPillars.tsx` + `ZiweiBoard.tsx` | ✅ 复核确认已对齐 —— 本次任务开始前的 R2 轮（提交 `11bbc73`/`bba6e42`）已完成细环卦字版/四柱文字化/紫微细线格并变异实证，本轮截图核对未发现新增偏差，未改代码 |

化解清单（`ObjectAdvisorForm`/建议列表）：决定 #5 —— 保留现有 effort 分类逻辑，R1/R2 已完成视觉对齐（细线/朱砂锚点），本轮截图核对无新增偏差，未改代码。

## Findings（逐页填）
7 页截图逐一比对完成。3 页（首页/命盘/化解）确认已对齐或仅文案级改动；4 页（档案/境/流日/起盘）有真实视觉/交互改动，均已实现、测试覆盖、变异实证。全部改动已提交（`3041a82`、`ef743cc`、`9a1532e`）。

## 验证状态（2026-08-18 完成）
- `pnpm typecheck`：通过（core + llm + web 三包）
- 全量测试：619/619 通过（core 158 / llm 182 / web 279，含本轮新增 profiles 5 + ReadingForm 3 + fengshui 新增 4）
- `pnpm --filter @eamvp/web lint`：0 errors / 18 warnings（均为既有已知项，非本轮引入，详见 `apps/web/eslint.config.mjs` 注释）
- `pnpm --filter @eamvp/web build`（`TELEGRAM_BOT_TOKEN=ci-placeholder-not-a-secret`）：成功，15 路由全部生成
- 独立 Review+Verification：**已完成**（fresh general-purpose subagent，无本 session 记忆，独立重跑 typecheck/test/lint/build 全部复核一致）。逐条核对 7 项决定：全部 ✅ 正确落地、无越界。重点复核 fengshui 页 narrative-collapse 回归防护——直读活文件确认 `NarrativeStatus` 无条件挂载，只有 render 回调受折叠态约束，结构成立。结论：**无阻塞项，可视为完成**。

## 未完成项 / 已知缺口
- 首页 footerBrand/ctaSecondary 文案改动未补测试（纯静态文本渲染，判断为低风险，未强制补齐；若独立评审认为需要可另开）。

## Human Owner 决定（本轮已批准，2026-08-18）
1. 起盘表单：整体从「方框输入」改为「细线值+标签」视觉语言 —— **做**
2. 起盘「近来关心」新字段 —— **不做**（现有 BirthInput/Profile 不动）
3. 档案页头「去账户」按钮 —— **保留**（screenshot 只是没截到，不是设计移除）
4. 境页「以居所方位为主视觉，逻辑反向」—— **claude 判断可行性后落地**
5. 化解 effort 标签（零成本/挪动/添置/装修）—— **保留现有分类逻辑**，只对齐视觉呈现（细线/朱砂锚点等，R1/R2 已大部分做到，本轮核对补齐）
6. 境/流日叙述层：不是全站都改，只这两处收成「一句话基调 + 别处/跳转展开详述」—— **做**
7. 流日主视觉：判词（现有 grade: 吉/顺/平/谨）提升为主视觉，评分环降级/移除 —— **做**；黄历值神/吉时/冲底部行 —— **不做**
