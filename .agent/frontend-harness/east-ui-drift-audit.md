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
| S1 首页·卷首 | `apps/web/app/page.tsx`（`!inTg` 分支） | 待审 |
| 档案·命盘分人而立 | `apps/web/app/profiles/page.tsx` | 待审 |
| 境·居所的方位 | `apps/web/app/fengshui/page.tsx`（chart tab） | 待审 |
| 流日 | `apps/web/app/calendar/page.tsx` | 待审 |
| 起盘·写下你的生辰 | `apps/web/app/reading/ReadingForm.tsx` | 待审 |
| 命盘·四柱+紫微 | `apps/web/app/chart/page.tsx` + `BaziPillars.tsx` + `ZiweiBoard.tsx` | 待审 |

## Findings（逐页填）
（见下方分页记录）

## Human Owner 决定（本轮已批准，2026-08-18）
1. 起盘表单：整体从「方框输入」改为「细线值+标签」视觉语言 —— **做**
2. 起盘「近来关心」新字段 —— **不做**（现有 BirthInput/Profile 不动）
3. 档案页头「去账户」按钮 —— **保留**（screenshot 只是没截到，不是设计移除）
4. 境页「以居所方位为主视觉，逻辑反向」—— **claude 判断可行性后落地**
5. 化解 effort 标签（零成本/挪动/添置/装修）—— **保留现有分类逻辑**，只对齐视觉呈现（细线/朱砂锚点等，R1/R2 已大部分做到，本轮核对补齐）
6. 境/流日叙述层：不是全站都改，只这两处收成「一句话基调 + 别处/跳转展开详述」—— **做**
7. 流日主视觉：判词（现有 grade: 吉/顺/平/谨）提升为主视觉，评分环降级/移除 —— **做**；黄历值神/吉时/冲底部行 —— **不做**
