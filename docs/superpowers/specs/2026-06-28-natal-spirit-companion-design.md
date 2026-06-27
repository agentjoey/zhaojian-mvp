# 本命之灵 · 陪伴层 — Design Spec

- **Date:** 2026-06-28
- **Status:** Draft（设计已确认，待 writing-plans 拆实施计划）
- **代号前缀:** `EP-spirit-*`
- **背景:** 竞品「万象有灵」调研 → 三条核心启示（对话式陪伴 / 命理体系可成长可视化 / 有人格温度的叙述者声音）
- **关系到 MVP 冻结:** 本设计为冻结后下一波 feature 工作；Phase 1 建议作为「收集反馈后」首个迭代候选。本设计不改动冻结命盘本身。

---

## 1. 问题与定位

「照见」当前是「排盘 → 静态三段式解读文档」。最大差异化短板：**没有一个能持续对话、随时间变熟、有温度的「人」**。

竞品「万象有灵」证明「关系化 + 成长化」能把一次性测算变为每日习惯，但其形态重（10 个轮换十神角色 + 3D 形象 + TTS + 金币抽卡，362MB）。

**本设计取其思想、弃其重资产**：引入**单一、从用户自己命盘派生、纯文本水墨**的陪伴人格——「本命之灵」。最 on-brand（照见 = 照见自己 / 镜像隐喻），且不破坏零重资产路线。

## 2. 统一概念

三条启示不是三个独立功能，而是**同一个灵的三个面**：

```
        ┌─────────────────────────────────────────────┐
        │  本命之灵（从用户自己命盘派生的唯一人格）          │
        │                                               │
  #3 →  │  人格温度：有名号 / 口吻 / 水墨印记的叙述者声音     │  ← 串起另外两面
        │      │                              │          │
  #1 →  │  会对话（常驻 /chart）        每日问今（/calendar）│
        │      │                              │          │
  #2 →  │  关系记忆（Phase 1） → 自我画像演化（Phase 2）     │
        └─────────────────────────────────────────────┘
```

## 3. 落地策略（已确认 = 方案 B：附加层）

灵作为**附加人格层**包裹现有架构，**不重写已验证的三段式解读**：

- 现有三段式分析解读 = **可信内核，保留不动**。
- 灵新增：(1) 第一人称**开场白**「认领」你的命盘；(2) 常驻**对话**入口；(3) **每日问今**。
- 人格生成走「**core 派生人格种子 + LLM 渲染口吻**」，与现有 `extractFacts → LLM 只解释` 完全同构。

**被否方案：** A（重写解读为灵口吻）推翻反幻觉资产、风险高；C（独立并列模块）叙事割裂、重复喂事实。

## 4. 架构与新增边界

新增 5 处，复用现有反幻觉链与持久化模式：

| 层 | 新增 | 性质 | 复用 |
|---|---|---|---|
| `core` | `deriveSpirit(chart) → SpiritPersona` | 纯函数，从命盘派生人格种子。确定性、可测、可缓存，**不进冻结命盘** | 同 `deriveStrength`/`deriveTriad` 派生模式 |
| `llm` | `buildSpiritSystemPrompt` + `streamSpiritChat` + 开场白生成 | 人格口吻渲染 + 对话 | `SYNTHESIS_GUARDRAILS` / `extractFacts` / `sanitizeReading` / `withRetry` 全复用 |
| `db` | `spirit_messages` 表 | profile_id FK、role、content、created_at；RLS by user_id | 同 `profiles` 匿名 + RLS |
| `db` | `profiles.spirit_memory` jsonb 列 | 滚动关系记忆摘要 | 加列，零迁移风险 |
| `web` | `/api/spirit/chat` SSE 路由 + 命盘页对话面板 + 日历问今卡 | 流式书写感 | 同 `/api/reading` SSE |

**刻意突破的旧边界（已批准）：** 从「按需现算、不积累」→ 新增**对话与关系记忆的持久化**。这是「成长」的物理基础。**命盘本身仍冻结不动。**

## 5. 人格种子模型（EP-spirit-01）

`deriveSpirit(chart: UnifiedChart): SpiritPersona`，core 纯函数。锚点（全部来自已有派生/字段，不臆造）：

- **命主星**（西方 chart ruler 落点 / 紫微命宫主星，西方盘缺失时退紫微）
- **日主十神倾向**（`bazi.tenGods` + `deriveUsefulElements`）
- **福德宫**（东西心理桥接最强锚点，已在 `extractFacts.ziwei.fortunePalace`）
- **主导五行**（`bazi.fiveElementCounts` 取峰）→ 决定**水墨印记 / 符号**与基调
- **核心张力**（西方硬相位 / 生年化忌所落宫，已在 facts）

输出（结构化人格种子，供 LLM 渲染口吻，**不含成稿文案**）：

```ts
type SpiritPersona = {
  archetype: string;        // 原型标签（如「守界者」「探光者」），由十神/命主星映射
  dominantElement: string;  // 主导五行 → 印记与色调基调
  toneHints: string[];      // 口吻提示（如「沉静」「直率」「温润」）
  anchorFacts: string[];    // 灵可在开场白/对话中引用的承重事实（命主星/福德/张力）
  coreTension: string;      // 核心成长课题（格林式，反思性）
};
```

**反幻觉：** `deriveSpirit` 仅做确定性映射，人格「身份」由命盘事实决定，非 LLM 杜撰。

## 6. 对话与反幻觉（EP-spirit-02/04）

灵的开场白与每句对话，system prompt 组成：

1. `buildSpiritSystemPrompt(spirit, facts, language)` = 人格种子 + `SYNTHESIS_GUARDRAILS` + 硬规则
2. `extractFacts(chart)` 承重事实
3. 已存解读摘要（`profiles.reading` 截要）
4. 关系记忆摘要（`profiles.spirit_memory`，Phase 2 起）

**反幻觉四道全程套用：**
- 只准引用 facts 内星曜 / 相位；**不预测吉凶、非决定论、反思性、成长导向**
- `sanitizeReading` 净化；四化 `correctMutagens` 纠正
- 西方盘缺失时降级（同 `streamReading` 既有降级路径）

**对话存储：** `spirit_messages`（profile_id、role∈{user,spirit}、content、created_at），RLS by `auth.uid()`，匿名会话隔离。支持「重新生成」。

## 7. 关系记忆（EP-spirit-05，Phase 2）

- `profiles.spirit_memory` jsonb：滚动摘要（关切主题 / 自陈情绪 / 反复议题），**无 PII**（同 EP-514 接地观测原则）。
- 每会话结束触发一次廉价**满窗摘要**更新（参照既有 LLM 调用 + `withRetry`）。
- 回填进 system prompt → 灵跨会话引用既往话题。「成长」= 关系变熟。
- token 受控：摘要定长截断。

## 8. 每日问今（EP-spirit-06，Phase 2）

- /calendar 灵第一人称**开场白**，接 `computeDailyFortune`（确定性五维）+ 今日干支 + 记忆摘要。
- 「问今日」CTA → 开对话面板，种子上下文 = 今日运势。
- 复用现有水墨配图与确定性五维，灵只「发声」，不臆造分数。

## 9. 自我画像演化（EP-spirit-07/08，Phase 3）

- 依赖 backlog 已有 **EP-profile-q**（心理问卷）。
- 问卷答案（主观自陈）并入灵上下文 → 命盘客观 + 自我认知主观，差异化最后一块。
- 自我画像可视化：五维 + 时序声部 + 记忆 → 随互动演化的画像（能量图鉴式水墨）。

## 10. UI / 视觉（轻资产红线）

- **无 3D / 无 TTS / 无金币。**
- 灵的「形象」= 主导五行派生的一枚**水墨印记 / 符号** + 名号 + 文本口吻。
- 温度靠文字与**素白水墨**美学（沿用 UI v2），不靠重客户端。
- 对话 UI：素白水墨气泡 + 流式书写感（复用现有 SSE）；移动 / 桌面响应式。

## 11. 分期 Backlog

### Phase 1 — 灵的诞生与对话（陪伴层 MVP，自成闭环可上线）

| ID | 层 | 内容 | 验收 |
|---|---|---|---|
| EP-spirit-01 | core | `deriveSpirit` 人格种子派生 | 纯函数 + 单测：无西方盘降级、空宫借星、不同日主→不同 archetype |
| EP-spirit-02 | llm | `buildSpiritSystemPrompt` + 第一人称开场白生成 | 开场白只引用 facts 内星曜/相位；eval 无幻觉、非决定论 |
| EP-spirit-03 | web | 命盘页灵开场白卡 + 水墨印记/名号 | 素白水墨；流式书写感；响应式 |
| EP-spirit-04 | db+llm+web | 常驻对话：`spirit_messages`(RLS) + `/api/spirit/chat` SSE + 对话面板 | 多轮落库、RLS 隔离、接地不越界、可重新生成 |

### Phase 2 — 关系记忆与每日问今（留存钩子，依赖 Phase 1 对话）

| ID | 层 | 内容 | 验收 |
|---|---|---|---|
| EP-spirit-05 | db+llm | 关系记忆：`spirit_memory` jsonb + 满窗摘要回填 | 跨会话引用既往话题；摘要无 PII；token 受控 |
| EP-spirit-06 | web+llm | 每日问今：/calendar 灵开场白 + 「问今日」CTA→对话 | 复用确定性五维不臆造；每日变化；接现有水墨配图 |

### Phase 3 — 自我画像演化（差异化最后一块，依赖 EP-profile-q）

| ID | 层 | 内容 | 验收 | 依赖 |
|---|---|---|---|---|
| EP-spirit-07 | llm+web | 心理问卷并入灵上下文 | 问卷答案进 system prompt、影响对话 | EP-profile-q |
| EP-spirit-08 | core+web | 自我画像可视化（五维+时序+记忆，随互动演化） | 画像随互动演变；可视化 on-brand | EP-spirit-05/07 |

## 12. 风险与边界

- **冻结期张力：** 本设计为冻结后 feature，非 bug 修复；建议 Phase 1 列为反馈收集后首个迭代候选，逐 Phase 上线。
- **持久化成本：** 新增对话/记忆表是刻意突破；命盘冻结不受影响，回滚仅需停用灵入口。
- **反幻觉回归：** 灵的对话是新的幻觉面，EP-spirit-02 必须扩 eval 用例（开场白/多轮对话不臆造星曜、不预测吉凶）。
- **token 成本：** 多轮对话 + 记忆摘要叠加 facts，需配合现有 prompt cache（EP-511）与定长截断。
