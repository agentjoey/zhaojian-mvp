# Spec — 并发架构（多用户 & LLM 并发调用）

> 状态：✅ 设计完成 · ⏸️ **MVP 后再实施**（决议 2026-06-19）· 作者：claude · 关联：`architecture.md`
> 触发条件：接近 MiniMax 并发/速率上限、或预期峰值并发上升时，从 Tier 0 起逐层实施。
> MiniMax 限额（查证见下「附录」）即 Tier 1 全局信号量阈值。

## 0. 问题
多用户并发，尤其**同时生成解读（流式调 LLM）**时，如何不崩、不超 provider 限额、不爆成本、且体验可接受。

## 1. 现状盘点（并发面）
- **Vercel serverless**：自动水平扩展。每个 `/api/reading` = 一函数实例，**持连接 15–25s**（流式）。短调用：server actions `dailyPolish/dailyBehavior/timeline`。
- **LLM**：全部打**单一 MiniMax-M3 key**（anthropic 线）。重 = 解读流式；轻 = 三个 daily/timeline 短调。
- **Supabase**：Postgres，连接有限（PostgREST 走连接池，压力小）。
- **已有并发缓解**：解读**一次生成持久化**（reading 列）；每日润色/行为宜忌/时序按 (档案,日期/年) **localStorage 缓存**；**EP-512 退避重试**吸收瞬时 429/5xx。
- **关键资产**：`computeUnifiedChart`(排盘)、`computeDailyFortune`(运势五维+趋吉避祸+黄历)、`computeZiweiHoroscope`(大限/流年四化) **全确定性，不调 LLM**。→ LLM 饱和时产品大部分仍可用。
- **缺口**：`/api/reading` **未设 maxDuration**；无 Fluid Compute 配置；**无全局限流/队列/幂等**。

## 2. 真正的瓶颈（不是 Vercel）
1. **LLM provider 并发/速率上限**：MiniMax key 的 concurrency / RPM / TPM。N 个用户同时生成 → N 个并发连接 → 超限即 **429 风暴**。← 头号约束。
2. **成本峰值**：并发峰值 = token 花费峰值，无上限保护会被刷爆（匿名尤甚）。
3. **serverless 限流难题**：**进程内信号量只能限单实例**；跨实例全局并发需**共享状态**（Redis/KV/队列）。
4. **长连接占用**：流式函数久占实例（账号并发数 + 成本）。

## 3. 设计原则
1. **先省再扩**：缓存/去重/确定性降级，把"必须打 LLM 的请求"压到最少（大部分已做）。
2. **全局背压**：总在途 LLM ≤ provider 能力；超出→排队或优雅降级，**绝不放任 429 风暴**。
3. **幂等去重**：同一档案的解读，同一时刻只生成一次（single-flight）。
4. **确定性兜底**：LLM 不可用 → 排盘/运势分/趋吉避祸/四化 chips 照常，仅 prose 延后。

## 4. 分层方案

### Tier 0 — 现在（MVP，低成本/多已做）
- ✅ 缓存/持久化 + ✅ 退避重试。
- **Fluid Compute（开启）**：流式 LLM 是 I/O 密集（等 MiniMax），fluid 让**单实例并发多请求**，省实例数+成本。**性价比最高的一步。**
- **路由 `maxDuration`**：流式给足时长（如 60s），避免默认超时截断。
- **客户端单飞**：生成中禁用入口（已有 streaming 标志）+ 防双击/双标签重复提交。
- **查清 MiniMax 计划并发/RPM/TPM 上限** —— 设全局闸阈值的关键数字。

### Tier 1 — 增长（并发逼近 provider 上限时）
全局并发闸（**跨实例**，二选一）：
- **A. 自建分布式限流**：Upstash Redis / Vercel KV 做**令牌桶/信号量**，键到 LLM provider；总在途 ≤ 上限，超出 → `503 + Retry-After`，前端显示"高峰排队中，稍候自动重试"。
- **B. Vercel AI Gateway（推荐评估）**：统一 LLM 入口，内置**限流 + provider 故障转移(MiniMax→DeepSeek) + 缓存 + 花费可观测**，少写自定义代码、一步到位。
- **每会话/IP 限流**（Upstash Ratelimit）：防匿名滥用/刷量。
- **服务端 in-flight 去重**：同档案在途解读用 KV 标记，重复请求复用结果。

### Tier 2 — 规模（异步化）
- **生成与请求解耦**：解读请求 → **入队**(Upstash QStash/队列) → worker 生成 → 写 Supabase → 客户端 **Supabase Realtime 订阅**结果。去长连接、天然背压、峰值不崩。代价：实时流式 → "生成中→完成通知"（或 worker 侧另起推流）。
- **Vercel Workflow (WDK)**：生成做成**持久、可重试、崩溃安全**的工作流。
- **多 key / 多 provider 池**：水平扩 LLM 配额。

### 横切
- **成本护栏**：解读已天然 1 次/档案；daily/timeline 已缓存；补"每匿名用户/日生成上限" + 全局花费告警。
- **可观测**（接 EP-514）：provider 429 率、队列深度、p95 延迟、token 花费。
- **优雅降级**：LLM 饱和/宕 → 解读区"稍后生成"，**排盘/运势/四化照常**；运势日历几乎无感。
- **DoS**：Vercel WAF/Firewall + 速率限制。

## 5. 推荐落地顺序（务实）
1. **现在**：Fluid Compute + `maxDuration=60` + 客户端单飞强化 + 查清 MiniMax 上限。（小、即时、够 MVP）
2. **临界前**：上 Upstash Ratelimit(会话/IP) + 全局信号量；或直接评估 **AI Gateway**（限流+fallback+观测一步到位）。
3. **规模化**：异步队列 + Realtime 通知（以非实时换稳态背压），或 Workflow 持久化。

## 6. 待确认参数（决定走到哪一层）
- MiniMax Coding/Token Plan 的**并发数 / RPM / TPM** = 全局信号量大小。
- 预期**峰值并发用户数**。
- 是否接受**异步生成（非实时流式）**以换规模稳定性（Tier 2 关键取舍）。

## 附录 — MiniMax 限额（官方查证，2026-06-19）
来源：[MiniMax Rate Limits 文档](https://platform.minimax.io/docs/guides/rate-limits)。限额**按模型**定（非按订阅档），对 Token/Coding Plan 的 `sk-cp` key 同样适用。

| 模型 | RPM | TPM | TPS | 并发 |
|------|-----|-----|-----|------|
| **MiniMax-M3（我们默认）** | **200** | **10,000,000** | 未公布 | 未公布 |
| MiniMax-M2.x（含 highspeed） | 500 | 20,000,000 | 未公布 | 未公布 |

- **TPS / 并发数官方未单列**：实际并发受 **RPM + TPM + 动态高峰限流**共同约束（高峰期会临时收紧，超限约 1 分钟恢复）。
- **对我们的含义（M3）**：
  - 单次解读 ≈ 输入(facts+system)~3–4K + 输出 ~2–2.5K ≈ **~6K tokens/次**。
  - TPM 10M ÷ 6K ≈ **~1600 解读/分钟**（token 维度很宽松）→ **不是瓶颈**。
  - **RPM 200 才是硬约束** = 每分钟最多 200 次 LLM 调用（解读 + polish/behavior/timeline 各算 1 次）。
  - 因解读 1 次/档案持久化、daily/timeline 已缓存，**稳态人均调用很低**；200 RPM 足以支撑相当数量的活跃用户，**MVP 阶段不会触顶**。
  - 触顶估算：若典型新会话 ~3–5 次 LLM 调用，200 RPM ≈ 可吸纳 **~40–60 新活跃用户/分钟**的突发；超此即需 Tier 1。
- **Tier 1 全局信号量建议阈值**：以 **RPM 200 为闸**，留余量（如令牌桶 ~150 starts/min 或在途上限），配合退避重试 + 高峰动态限流感知；provider 故障转移目标 = DeepSeek（另算其自身限额）。
- DeepSeek（openai 线备用）限额另查；AI Gateway 方案可统一管理两家配额。
