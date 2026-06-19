# Current Status — 照见 Zhaojian

Version:        v0.1.0（线上 MVP + 引擎深化 v2；未走 release.sh，号未升）
Sprint:         001 → 引擎深化 v2（已完成）
Sprint Status:  ✅ MVP 上线 + 引擎深化完成
Last Updated:   2026-06-19 by claude-opus-4-8
线上:           https://zhaojian-mvp.vercel.app · zhaojian.agentjoey.ai
测试:           core 45 · llm 32（全绿）

## 产品现状（一句话）
东方命理（八字+紫微）× 西方心理占星（利兹·格林）双引擎，已上线完整闭环：
**起盘 → 命盘建档（冻结存 Supabase）→ 三段式解读（持久化）+ 当下时序 → 运势日历（每日+本年上下文+水墨配图）→ 档案**。

## 已上线能力
| 模块 | 内容 |
|------|------|
| 起盘 `/reading` | 地名→经纬度/时区(Nominatim+tz-lookup)、时辰实时显示+不知时辰开关、真太阳时(含 EoT) |
| 命盘 `/chart` | 四柱/紫微/西方盘可视化 + 三段式解读(一次生成持久化、命盘冻结) + **当下时序卡**(大限/流年四化,按年缓存) |
| 运势 `/calendar` | 每日流日(确定性五维+趋吉避祸+黄历) + **本年/本限上下文条** + 框景水墨配图 + 大字总评 + 五行干支 + 心理行为宜忌(LLM) + 轻润色 |
| 档案 `/profiles` | Supabase 匿名+RLS 隔离、命盘触发器冻结 |

## 三层架构（详见 docs/architecture.md）
- **@eamvp/core**：三引擎 + `normalizeBirth`(真太阳时+EoT+子时sect) + `computeDailyFortune` + 引擎深化 v2 派生(见下) + 共振映射；纯函数/Zod/可缓存。
- **@eamvp/llm**：provider 无关双线(anthropic MiniMax-M3 / openai DeepSeek) + 三声部+时序声部 + **反幻觉链四道**(extractFacts→prompt硬规则→sanitize→correctMutagens)+eval + 重试/缓存/观测 + daily润色/行为/时序。
- **apps/web**：Next 16/React 19/Tailwind 4，框景配图、Markdown 渲染、Supabase。

## 引擎深化 v2（本轮重点，spec `docs/specs/engine-v2-deepening.md`，全 11 项✅，TDD）
**核心原则**：新命理量在 facts 层派生、**不进冻结命盘**（新旧命盘通吃、零迁移）。
- 命理深度：旺衰证据化(502) → 用神扶抑(501) → 紫微三方四正借星(503) → 流日×本命冲合刑害+用神(504, 千人千日) → 西方画像 元素/模式/命主星/月相(505)。已接入 facts+prompt+日历，实跑验证四类新事实落地、无幻觉。
- 工程：prompt 缓存(511, 实测 MiniMax-M3 支持) · LLM 重试/超时(512) · 西方数据校验(513) · 无 PII 接地观测(514)。
- 演进：紫微大限/流年四化(521)→**时序声部** `generateTimeline` + /chart 当下时序卡 + /calendar 本年上下文 · Placidus 宫制(522, 引擎就绪默认仍 whole-sign)。

## Open Bugs / 已知限制
🟢 无 P0/P1。
📌 启发式（已标注，非 bug）：旺衰/用神为扶抑启发式（学派分歧大，prompt 标「启发式」并优先喂证据让模型权衡）；真太阳时含 EoT 但仍平太阳时近似。
🔭 未接入产品：EP-521 大限/流年已就绪，时间线「年→限→日」已贯通；EP-522 Placidus 仅引擎+单测。

## Next Sprint Candidates
- [ ] [EP-profile-q] [MED] 建档交互式心理问卷：主观自陈并入解读上下文（命盘客观 + 自我认知，差异化最后一块）。
- [ ] [EP-cal-img-2] [MED] 配图扩库 + 筛图从人工转 agent reviewer（skill `curate-fortune-images` 已就绪）。
- [ ] [EP-timeline-2] [MED] 时间线深化：大限/流年四化叠西方行运、时序声部更厚。
- [ ] [EP-theme] [MED] 三套基调皮肤切换；[EP-auth] 账号升级跨设备同步。
- [ ] [EP-002-cal-2] [MED] 排盘金标准：调候用神、对照官方计算器。

## Version History（里程碑）
| 标记 | Date | Summary |
|------|------|---------|
| MVP 立项 | 2026-06-18 | 双体系调研 + 产品/架构/UI 设计 + 脚手架（Sprint 001） |
| MVP 三引擎+解读 | 2026-06-18 | EP-001~008 + eval + 四化纠正：三引擎 + 双线解读层 + 设计系统 + 4 图谱 + 运势日历 |
| 上线 | 2026-06-18 | EP-DB(Supabase) + EP-DEPLOY(Vercel) + EP-MODELS(维持 M3) |
| v2 上线优化 | 2026-06-19 | 起盘 UX + 西方盘重绘 + 解读持久化 + 自定义域名 |
| 运势日历升级 | 2026-06-19 | 排盘精度(EoT/子时) + 轻润色 + 水墨配图(框景) + 大字总评/五行chip/心理宜忌 |
| 引擎深化 v2 | 2026-06-19 | 11 项：命理深度(用神/旺衰/三方四正/流日互动) + 工程(重试/缓存/校验/观测) + 时序层 |
