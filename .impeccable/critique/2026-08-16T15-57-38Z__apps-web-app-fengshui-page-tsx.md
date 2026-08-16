---
target: /fengshui 境页
total_score: 26
p0_count: 2
p1_count: 2
timestamp: 2026-08-16T15-57-38Z
slug: apps-web-app-fengshui-page-tsx
---
# 「境」/fengshui 设计评审（impeccable critique）

Method: dual-agent (A: agent-0 设计评审 · B: agent-1 探测器)
Target: apps/web/app/fengshui/page.tsx（含 object/dwellings 子页、BaguaWheel、TG 原生原语）

## Design Health Score（Nielsen 10 项）

| # | 启发式 | 分 | 关键问题 |
|---|--------|----|----------|
| 1 | 系统状态可见 | 2 | LLM 叙述加载全程静默，NarrativeStatus 加载中返回 null，盘 tab 顶部空白 |
| 2 | 贴近用户语言 | 2 | en UI 下方位字/星名/化解卡全文仍是 core 硬编码中文 |
| 3 | 用户控制与自由 | 3 | 两步删除/编辑回显好；但 dwellings[0] 硬编码，多套居所不可切换 |
| 4 | 一致性与标准 | 3 | 令牌纪律严格；同一「去起盘」CTA 三处三种形态 |
| 5 | 错误预防 | 3 | facing 三重防错是模范；DwellingForm.save() 无 catch 静默失败 |
| 6 | 识别优于回忆 | 2 | 盘无色阶图例，rank 深浅无任何处解释 |
| 7 | 灵活与效率 | 3 | 指纹缓存+重试机制成熟；无快捷键（MVP 可接受） |
| 8 | 美学与极简 | 2 | 克制滑向贫血：Layer 1 一屏 8 个信息块全部同字号同字重，无视觉锚点 |
| 9 | 错误识别与恢复 | 3 | 「读取失败≠没登记」「探测失败≠非会员」是全场最佳；save() 静默失败扣分 |
| 10 | 帮助与文档 | 2 | facingHint 极好；术语（本命卦/东四命/相冲）无解释入口 |
| **总分** | | **26/40** | **Acceptable——骨架诚实、表现力不足** |

## Anti-Patterns 判定

**LLM 评估：不像 AI 生成。** 色板（素白+朱砂单点）、11/16/20 非常规圆角刻度、印章/铜铃品牌件都是人定的体系。唯一命中：TG `Section` 的 12px uppercase tracking-wide 标题是教科书式 eyebrow（半条，仅 TG 臂）；Paywall 有 1px border + 卡片 shadow 同挂。真正的问题是平庸不是 slop：境页是「720px 单列 + 18px serif 标题 + 13px muted 说明」的无限重复，与 calendar 页（深色 hero + 评分环 + 干支徽 + CastingOverlay 过场）差一整代。

**确定性扫描：0 findings**（两轮，含扩范围重扫；金丝雀测试验证探测器工作正常，零结果为真）。uppercase eyebrow 一处探测器正确地未报（短标签未达正文阈值），判误报候选、记录在案。

**浏览器可视化**：skipped（本环境无浏览器自动化工具）；contrast/dark-glow/nested-cards 等运行时规则本轮无证据——但 Assessment A 用相对亮度公式实算了关键对比度，覆盖了该缺口的主要部分。

## Overall Impression

工程诚实度 senior 级（闸门五态、失败语义区分、facing 防错三重），视觉与情感表现力占位级。不丑、不 AI、不糊弄——只是把全站最有仪式感潜力的一张图（八方位盘）排成了一条信息流的中段。最大机会：把盘从「图表组件」升为「页面主角 + 导航枢纽」。

## What's Working

1. **闸门五态状态机**（idle/probing/entitled/blocked/unknown）：「不知道」与「没有权限」分开两种 UI，探测失败给「重新确认」而非付费墙。大多数付费产品这道墙都做错了，这里做对了。
2. **BaguaWheel 确定性三通道**：每扇区吉凶 = 色彩 + 星名文字 + aria-label 字面。纯查表渲染，LLM 挂了页面不白。
3. **facing 录入「不确定就不猜」**：图形按钮防理解反 +「站在屋内面朝大门」动作级提示 +「不确定」一等选项触发诚实降级——把领域最常见错误在设计层消掉的范例。

## Priority Issues

1. **[P0] muted/gold 对比度系统性不达标（亮主题）**。实测：`--color-muted #9c9486` on paper = **2.75:1**（AA 要求 4.5:1）；`--color-gold #b89a63` on paper = **2.46:1**。受害者 = 全部辅助文字：副标题、disclaimer、TG Section/Cell 副标题、删除/取消按钮。暗主题反而达标（5.08:1）——是亮主题孤例失误，不是体系问题。**修法**：`globals.css` 一处：`--color-muted` 提到 `#7d766a`（≈4.6:1）；gold 限 ≥18px 大字/装饰。一个变量修全站。命令：`$impeccable audit` 或 `polish`。
2. **[P0] BaguaWheel 星名文字在其自身底色上不可读**。凶方 muted 星名 on 墨混底 = **1.48:1**；吉方朱砂星名 on 朱砂混底 = **2.50:1**。组件注释自称星名是「主吉凶信号的冗余通道」——这个通道本身读不清。**修法**：星名改统一墨色（fill: var(--color-ink)），吉凶由扇区色 + aria-label 承载；或给星名加 paper 底 pill。命令：`$impeccable polish` 定向 BaguaWheel。
3. **[P1] 峰值时刻缺席，与自家产品差一代**。用户第一次看到「自己的八方吉凶」——「境」产品线的存在理由——发生方式是一个 SVG 瞬间出现，无入场无过场。calendar 的 CastingOverlay（印章+干支 2.1s）与 chart 的打字机书写感都是**已有资产**，境页一个没用。**修法**：首次计算播一次 CastingOverlay（seal="境"），八扇区按吉凶 rank 错峰 fade-in（globals 已有 animation-delay 惯例）。命令：`$impeccable animate` 或 `delight`。
4. **[P1] 两个盘无区分 + 切换无状态提示**。Layer 1 同屏两个同形 BaguaWheel 上下排，区分只有盘下 13px 小字；切 viewAs chip 静默换色，滚两屏后不知道眼前是哪个盘、谁的盘。**修法**：本命盘中心标签加人称（「你 · 离九」vs「离宅」）；切 chip 时盘容器 200ms opacity 过渡 + 盘上方固定一行「正以 {name} 的视角看」。命令：`$impeccable clarify` + `animate`。
5. **[P2] en 用户核心内容未翻译**。DIRECTION_LABEL、八星名、化解卡 action/traditional 均为 core 硬编码中文——境页对英文用户当前不可交付。**修法**：core 输出结构化为 {key, params}，web 按 locale 套模板；最低限度先建 12 个词条映射。注意：这与 CURRENT.md 里「开 flag 前先补英文侧」的阻塞项是同一件事。命令：`$impeccable harden`。
6. **[P2] DwellingForm.save() 失败静默**（try/finally 无 catch）。**修法**：catch + 一行错误文案 + 保留表单（同 deleteError 模式）。命令：`$impeccable harden`。
7. **[P3] 「添置」tab 是空壳**：整 tab 只有一张卡一个跳转按钮。**修法**：内嵌 ObjectAdvisorForm，干掉一层导航。命令：`$impeccable distill`。

## Persona 红旗

- **Jordan（英文，术语黑话）**：盘 tab 的八个中文方位字 +「生气/五鬼」+ 化解卡整段中文——境页对 Jordan 当前不可交付。物件顾问的材质/造型下拉同样中文。这是 P2#5 的具象化。
- **Casey（TG 单手）**：原生臂整体扎实（Segmented/Group+Cell/MainButton/haptics）。红旗：ViewAsChip ≈28px、TG 居所行删除/确认文字链 13px、web tab 按钮 ≈34px——全部低于 44px 拇指区。Cell 图标取成本标签首字（零/挪/添/装）是聪明的省钱做法，成立。
- **Sam（读屏/对比度）**：亮主题辅助色全面不达标（P0#1）；TG 暗主题达标。web 臂 tab 行是纯 button 无 role/aria-selected；ViewAsChip/朝向网格/同住人 chips 全靠朱砂描边传达选中、无 aria-pressed——Sam 在 web 臂听不到任何「当前选中」。BaguaWheel 每扇区 `<g aria-label>` 在读屏上支持不稳定，吉凶可能整盘只剩一句总 label。

## Minor Observations

- 「去起盘」CTA 三处两种权重（实心按钮 vs 文字链）。
- 探测在途态是「加载中…」一行字占位整块宅盘区，无骨架。
- Card.topAccent 支持五行色顶条，calendar 已用（宜=wood/忌=fire），化解卡没用——零成本/挪动/添置/装修是现成分级语义，一条顶色即可扫读。
- globals.css 的 prefers-reduced-motion 处理完整——动效纪律高于页面设计水平。
- zh 字典 directionsTitle/affinityTitle 已无调用方，死文案。
- Centered 组件在三个文件重复定义三遍。

## Questions to Consider

1. 如果八方位盘不是展示件而是整页导航枢纽呢？点「生气」扇区 → 下方过滤出落在该方位的化解与物件建议。「方位」这个产品核心概念目前在盘与清单之间没有任何连接。
2. 「化解」为什么是清单而不是地图？用户拿着「把床头挪到东南」时，缺的是「东南在我家哪」。
3. 首屏默认 tab 为什么是看（盘）而不是做（化解）？第二次打开时盘没有新信息，行动清单才有回访价值。
4. 宅盘被付费墙挡住时，为什么用纯文字卡，而不是把宅盘渲染成模糊/去色的剪影？「看得见形状、看不清内容」同时完成诚实告知与转化。
5. 首次揭晓的 2 秒过场（CastingOverlay）是资产还是噪音？三个产品线要么统一播、要么统一撤——现在的不一致最没有立场。
