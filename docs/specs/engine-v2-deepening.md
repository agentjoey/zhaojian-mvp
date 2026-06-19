# Spec — 引擎深化 v2（命理深度 / 健壮性 / 演进）

> 状态：✅ 全部实施（11/11，TDD，core 45 + llm 30 测试） · 作者：claude · 日期：2026-06-19 · 关联：`architecture.md §7`、`.agent/BACKLOG.md`
> 实施说明：EP-501/502/503/505 已接入 extractFacts+prompt（实跑验证四类新事实落地、无幻觉）；EP-504 已接入 dailyPolish/dailyBehavior + 日历 UI；EP-511/512/513/514 已接入 LLM 客户端/解读层；EP-521(大限流年)/EP-522(Placidus) 为**引擎能力就绪 + 单测**，尚未接入解读/UI（时间线层为后续）。
> 目标：在不破坏「计算确定性 / 反幻觉」前提下，补齐引擎的命理深度，强化工程健壮性，并为时序解读铺路。

## 0. 贯穿性设计原则（所有条目必须遵守）

1. **派生事实在 facts 层计算，不进冻结命盘。** 新的命理量（用神/旺衰证据/三方四正/西方画像）一律由**核心纯函数**从既有 `UnifiedChart` 派生，在 `extractFacts` 时调用——**不新增 `UnifiedChartSchema` 必填字段**。
   - 理由：线上 `profiles.chart` 是**冻结 jsonb**，老命盘没有新字段；派生式让新旧命盘都自动享受，零迁移、零 Zod 破坏。
   - 例外：`DailyFortune` 不落库（每次现算），可自由扩展。
2. **仍然只喂事实、LLM 只解释。** 所有新增量是确定性输出；prompt 只是把它们接地，反幻觉链不变。
3. **每条都要可验证。** core 单测（算法正确）+ 必要时新增 eval 用例/scorer 检查（接地正确）。
4. **向后兼容。** 新增 `extractFacts` 字段对 prompt 是增量；老 prompt 行为不回归（eval 基线不降）。

---

## Phase 1 — 命理深度（产品价值最高，集中在 core + facts）

### EP-502 旺衰证据化（先于用神）
**动机**：现 `assessStrength` 只用主气加权出单字标签，可能喂给模型一个错判。
**设计**：保留 `strong/weak/balanced` 判词，但**补结构化证据**，并把判据深化到藏干。
- 新核心函数 `deriveStrength(bazi): StrengthEvidence`（`packages/core/src/bazi/strength.ts`）：
  - `得令`: 月支主气（及藏干）对日主的帮扶关系（印/比=得令）。
  - `通根`: 扫四支**藏干**（本气/中气/余气，权重 1/0.6/0.3），日主在某支藏有比劫或印 → 记为一处根，返回 `roots: {branch, via:"比劫"|"印", weight}[]`。
  - `印比 vs 克泄耗`: 全盘天干+地支藏干按同党(印+比)/异党(食伤+财+官杀)加权计数。
  - `ratio = 同党/(同党+异党)`，沿用阈值（≥0.55 强 / ≤0.40 弱 / 间中和），月支加权最高。
- `ChartFacts.bazi` 增 `strength: { verdict, 得令, roots, 同党, 异党, ratio }`；prompt 改为「以下为日主旺衰判据，据此判断身强身弱，勿臆断」。
**接入**：`extractFacts` 调 `deriveStrength(chart.bazi)`。`computeBaziChart` 的 `dayMasterStrength` 改用 `deriveStrength(...).verdict`（保持字段）。
**测试**：1991 甲木弱案例 → verdict=weak、roots 含卯(比劫)；强根案例 roots 多。

### EP-501 用神 / 喜忌（扶抑法）
**动机**：八字解读的核心「这盘需要什么五行」目前完全缺失。
**设计**：核心函数 `deriveUsefulElements(bazi, strength): { favorable: string[], unfavorable: string[], method, note }`（扶抑用神）：
- 设日主五行 M，五行相对 M 的角色：比劫(=M)、印(生M)、食伤(M生)、财(M克)、官杀(克M)。
- **身强** → 喜用 = 食伤/财/官杀 对应五行；忌 = 印/比。
- **身弱** → 喜用 = 印/比 对应五行；忌 = 食伤/财/官杀。
- **中和** → 标 `favorable=[]`、`note:"喜流通，不取明显扶抑"`，可给「平衡」提示。
- v1 仅扶抑；**调候**（冬生喜火、夏生喜水的季节微调）记为 v2 增强（`note` 先附一句季节提示）。
- 映射回具体五行字（如 甲木弱 → 喜「水、木」，忌「火、土、金」）。
**接入**：`ChartFacts.bazi.favorable/unfavorable`；prompt 成长段可据此给「宜近木/水、利东方/北方」类**接地**建议。
**测试**：甲木弱 → favorable=[水,木]；丙火强生于夏 → favorable 含 水/金，note 提调候。

### EP-503 紫微三方四正（借星，空宫接地）
**动机**：prompt 让模型「空宫走三方四正」，但 facts 没给三方四正的星，模型只能猜。
**设计**：核心函数 `deriveTriad(palaces, palaceName): { stars: string[], borrowedFrom: string[], isEmpty: boolean }`：
- 12 宫按 iztro 顺序成环，目标宫 index i：对宫 `(i+6)%12`、三合 `(i+4)%12`、`(i+8)%12`。
- 三方四正星 = 本宫 + 这三宫的主星（标注借自哪宫）。`isEmpty` = 本宫无主星。
**接入**：`ChartFacts.ziwei` 增 `soulTriad`（命宫三方四正），可选福德/官禄。prompt：「命宫空宫时，以下三方四正借星为据」。
**测试**：构造空命宫案例 → soulTriad.stars 非空、borrowedFrom 含对宫。

### EP-505 西方 facts 增强
**动机**：现仅 sun/moon/asc/saturn+相位串，格林解读欠元素/模式/命主星/月相。
**设计**：核心函数 `deriveWesternProfile(western): {...}`：
- `elementBalance`: 十星落入 火/土/风/水 计数（按星座元素）。
- `modalityBalance`: 基本/固定/变动 计数。
- `chartRuler`: 上升星座的现代守护星 + 其星座宫位（如 上升天蝎 → 冥王，落 X 宫）。
- `moonPhase`: 日月黄经差 → 新月/上弦/盈凸/满月/亏凸/下弦/残月。
- `patterns`: 检测星群(stellium，≥3 星同星座/宫)、T 三角（两星对分 + 共同四分）。
**接入**：`ChartFacts.western` 增上述字段；prompt 心理段提示用元素/模式平衡谈心理类型，用月相谈情感节律。
**测试**：balance 计数之和=10；chartRuler 解析成功；已知满月盘 moonPhase=满月。

---

## Phase 2 — 每日「千人千日」（解锁更厚卦象）

### EP-504 流日 × 本命 冲合刑害 + 用神
**动机**：现 `RELATION_PROFILE` 同关系日恒同分；竞品能写「子午冲动财星根基」是因为算了流日 vs 本命的互动。
**设计**：扩展 `computeDailyFortune`：
- 静态表 `六冲/六合/三合/相刑/相害`（地支关系）。
- 流日干支 vs 本命四支（年/月/**日**/时），逐一检测冲合刑害 → `interactions: {kind, withPillar, branch, note}[]`（日支冲=自身受动，最重）。
- 流日五行 ∈ 用神 → 分数 +1~2 且 `favorableToday=true`；∈ 忌神 → −1~2。`RELATION_PROFILE.base` 作为基线，按互动 + 用神调整 → **千人千日**。
- `DailyFortune` 增 `interactions`、`favorableToday`；这些即**厚卦象**（#5）的喂料：日历可由 `dailyPolish/dailyBehavior` 消费 interactions 生成「机制+心理+行动」的个性化长文。
**接入**：`computeDailyFortune` 签名不变（已收 chart）；新增字段。日历 UI 可显示 interactions 标签。
**测试**：同 relation、不同本命 → interactions/分数不同；流日用神日 favorableToday=true。

---

## Phase 3 — 工程健壮性 / 成本（@eamvp/llm，改动小）

### EP-512 LLM 客户端 重试 + 超时（可先做，最快收益）
- `client.ts` `post()` 包重试：网络错误 / 5xx / 429 → 指数退避（如 300/900ms，最多 2 次）；4xx 不重试；尊重 `opts.signal`。
- 加超时：非流式 `AbortController` 默认 60s；流式仅连接阶段超时。
- **测试**：mock 首次失败再成功 → 重试；400 → 不重试。

### EP-511 Prompt caching（anthropic 线）
- `client.ts` anthropic body：`system` 由字符串改为 `[{type:"text", text, cache_control:{type:"ephemeral"}}]`；加 `LlmConfig.cache?:boolean`（默认开）。
- **风险**：MiniMax-M3 anthropic 兼容是否真正支持 cache_control 未证实 → 先**实测**用量返回的 cache 字段；不支持则无害降级（字段被忽略）。量化延迟/成本变化记入 `llm-model-comparison.md`。
- **测试**：blocked system 请求成功；记录 usage。

### EP-513 西方数据质量校验
- `western/index.ts` 返回前校验：任一行星 `sign===""` 或 `ascendant.sign===""` → 视为失败，`return null`（走降级），并 `console.warn`。
- **测试**：正常盘所有 sign 非空；（构造畸形输入）→ null。

### EP-514 生产接地观测
- `reading.ts`/`route.ts` 输出结构化日志（无 PII）：model、四分节是否齐、长度、`correctMutagens` 命中数、`sanitizeReading` 是否触发。Vercel 日志可查。
- **测试**：n/a；确认日志不含出生信息/昵称。

---

## Phase 4 — 架构演进（更大，置后）

### EP-521 紫微 大限 / 流年四化
- 新 `computeZiweiHoroscope(birth, date)`：用 iztro `astro.bySolar(...).horoscope(date)` 取当前大限宫 + 流年四化（流月可选）。
- 产出独立的「时序 facts」，喂时间线/厚卦象解读；**不进冻结命盘**（按 date 现算）。
- **测试**：horoscope 返回当前大限宫 + 流年四化四颗。

### EP-522 Placidus 宫制（可选）
- `computeWesternChart` 加 `houseSystem` 参数（默认 whole-sign，可选 placidus）；circular-natal-horoscope-js 原生支持。
- **测试**：placidus 盘宫位计算成功。

---

## 依赖与排期

```
Phase 1: EP-502 旺衰证据 → EP-501 用神（依赖 502）；EP-503 三方四正、EP-505 西方增强（并行独立）
Phase 2: EP-504 流日×本命（依赖 501 用神）
Phase 3: EP-512 重试（最快，可提前）、EP-511 缓存、EP-513 校验、EP-514 观测（并行独立）
Phase 4: EP-521 大限流年、EP-522 Placidus
```
- 工程项 **EP-512 / EP-513 可提前到 Phase 1 并行**（改动小、收益即时）。
- 每个 Phase 末跑 `pnpm --filter @eamvp/core test` + `@eamvp/llm` eval，确保**接地基线不降**且新事实被正确引用。

## 验收标准（整体）
- core/llm 全测试通过；新增算法各有单测。
- eval 接地基线 ≥ 现状（新增「用神/三方四正被正确引用、未臆造」的检查项）。
- 实跑一份解读：成长段出现**基于用神的接地建议**，命理段在空宫时**引用三方四正而非杜撰**，心理段用到**元素/模式/月相**。
- 日历：同关系不同本命 → 配文/分数不同（千人千日）。
- 无 `UnifiedChartSchema` 必填字段变更；线上老命盘解读不报错。

## 风险
- **MiniMax M3 缓存支持未知**（EP-511）→ 先实测，不支持则跳过、不阻塞。
- **用神/旺衰是启发式**，命理学派分歧大 → 文案标注「启发式判读」，并优先「输出证据让模型权衡」而非武断单判。
- **iztro horoscope API 细节**（EP-521）需先验证返回结构。
