# 解梦 · 灵的专门技能 + 独立入口 — Design Spec

- **Date:** 2026-08-19
- **Status:** Draft（方案已与 owner 确认 = 方案 B，待 writing-plans 拆实施计划）
- **代号前缀:** `EP-dream-*`
- **上游讨论:** 2026-08-19「解梦能不能做」研究结论（方案 A 纯语域 / **B 独立入口+专门技能** / C 符号词典引擎被否）

---

## 1. 问题与定位

用户想在「照见」里解梦。与产品其他模块的本质不同：**梦没有确定性计算层**——命盘、流日、风水方位都是先算后说，梦的内容完全来自用户自由文本，反幻觉四道赖以存在的 facts 锚在这里不存在。

**定位**：解梦是「本命之灵」的一项专门技能 + 一个独立入口。解读立场 = 产品既有「心理映照」线的正统延续（荣格：梦是潜意识的信），传统象征仅作文化参照。**观照，不预言。**

## 2. 核心架构决策：锚人，不锚梦

没有计算层，就把解读锚在**这个人**上——这是本设计最重要的决策：

| 可锚资产 | 来源 | 作用 |
|---|---|---|
| 人格种子（原型/核心张力） | `deriveSpirit(chart)` | 口吻与视角的一致性 |
| 关系记忆 | `profiles.spirit_memory` | 「你最近在焦虑什么」与梦的呼应 |
| 问卷自陈 | `formatQuestionnaire` | 主观自我认知对照 |
| 本命盘事实 | `extractFacts(chart)` | 轻引（沿用单事实引用规则） |

**被否方案 C（周公解梦符号词典）**：自由文本→符号的抽取本身要靠 LLM（关键词匹配撞中文子串坑），且传统解梦书的吉凶断言与产品立场冲突。投入产出不成立。

## 3. 解读的结构与规则

输出四段式（灵的第一人称，全程在角色内）：

1. **直观**（1–2 句）：灵对梦的第一反应，在 persona 口吻里
2. **这个梦在说什么**（心理映照，主体）：锚到记忆/问卷/核心张力；是「这个梦可能在替你处理什么心事」，不是符号查表
3. **传统说法**（可选，有才有）：**必须带诚实标注**——「民间说法里…」「传统上认为…」，措辞为文化参照，照搬风水「传统象征/传统+现代」的判别纪律
4. **一个邀请**（1 句）：值得留意或可做的一件小事

**硬规则**（进 prompt，中英双版）：
- 长度：这是显式展开场景，上限 8 句 / 中文 300 字（覆盖 voice 的默认短答档，allowLong）
- 禁用「预示着」「将会」「凶兆/吉兆」等预言措辞（传统说法段除外，且必须有标注）
- 噩梦/创伤内容：支持性回应优先于解析；不做医疗/心理诊断（沿用 `SYNTHESIS_GUARDRAILS` 生死/医疗红线）
- 梦中出现死亡/疾病：不解读为预兆，只作心理映照
- 沿用 voice 全部纪律：单事实引用、不问句收尾默认、禁用清单、voice anchors

## 4. 技术设计

| 层 | 新增 | 说明 |
|---|---|---|
| `llm` | `interpretDream(chart, dreamText, opts) → AsyncGenerator<string>` | 流式；复用 persona/voice anchors/禁用清单/`sanitizeReading`/`correctMutagens`/脚手架护栏（`stripSpiritScaffolding`）；memory/questionnaire 经 opts 注入（同 streamSpiritChat） |
| `llm` | system prompt 解梦变体 | 在 `buildSpiritSystemPrompt` 基础上加 §3 规则块；冻结部分在前（prompt-cache） |
| `web` | `POST /api/spirit/dream` | body: `{chart, dream, memory?, questionnaire?}`；Bearer 识别 + `consumeLlm` 闸门；SSE text/plain；dream 文本长度上限（如 2000 字）服务端校验 |
| `web` | `POST /api/tg/dream` | 照 `api/tg/spirit` 鉴权范式：cookie session → uid → profile 服务端取，**客户端不传 chart**；`consumeQuota` + `consumeLlm` 双闸 |
| `web` | `/dream` 页面 | PageHeader（kicker 走 i18n）+ 输入区 + 流式解读区；TG 臂复用同树 + MainButton 提交（同 reading 页模式）；梦境文本**不落库** |
| 记忆 | 复用 `summarizeSpiritMemory` | 解读完成后把「用户做了一个关于 X 的梦 + 灵的解读要点」提炼进滚动记忆（沿用无 PII 约束）；**梦原文不存储** |

**入口三处同步**（`app/page.tsx` 有醒目注释的教训——TG_ENTRIES 曾零覆盖导致风水静默失踪）：
1. 首页 web 臂目录列表加一条（「梦」）
2. 首页 TG 臂 `TG_ENTRIES` 加一条
3. `AppShell.NAV` 加一条（char「梦」）

**门控**：全程 `NEXT_PUBLIC_DREAM_ENABLED`，默认关。flag 关闭时三处入口不出现、`/dream` 与两个 API 不可达（API 侧也要查 flag，不只藏入口）。

**bot 私聊**：v1 不加专门命令；灵的 DM prompt 层自然获得解梦语域（persona 层全灵共享），不做结构化输出保证。

## 5. 隐私与安全红线

1. **梦原文不落库、不进日志**——`logSpiritMeta` 只记 chars 的惯例延续；memory 摘要沿用无 PII 规则
2. 噩梦/自伤/创伤内容 → 支持性回应，建议寻求真人帮助的措辞要温和且不念经（一次、轻轻带过）
3. **英文优先**：规则块与入口文案 zh/en 双份（I4 教训）；解读语言跟随 locale
4. API 错误码与既有 `api/*` 一致：未登录 401、入参非法 400、LLM 未配置 503、生成失败 500、额度 402

## 6. 验证

- **探针扩展**：`probe:voice` 加梦例集（坠落/被追/掉牙/水/已故亲人/考试/迷路/飞翔 8 例），机械检查 length/禁用词/**预言措辞** + 人工读样；上线前全跑一遍
- **llm 单测**：prompt 含四段结构与硬规则；memory/questionnaire 注入；dream 长度上限；sanitize/护栏仍生效
- **web 测试**：双路由鉴权（401/402/400）、flag 关闭不可达、**三处入口同步**（首页 TG 入口测试同规格：flag 开出现且导向 /dream，flag 关不出现）
- 断言纪律沿用：每条断言自问「改坏了会红吗」；关键分支变异验证

## 7. 明确不做（v1）

- 梦境日记/历史列表（隐私优先，v2 再议）
- 符号词典/确定性解梦引擎（方案 C，已否）
- bot 私聊的 `/dream` 命令
- 解梦分享卡片

## 8. 建议任务拆分（供 writing-plans）

- `EP-dream-01` llm：`interpretDream` + prompt 变体 + 单测
- `EP-dream-02` web 路由双端 + 闸门 + 路由测试
- `EP-dream-03` `/dream` 页面（web 臂 + TG 臂）+ 三处入口 + flag 门控
- `EP-dream-04` 探针梦例集 + 实跑验收 + CURRENT.md
