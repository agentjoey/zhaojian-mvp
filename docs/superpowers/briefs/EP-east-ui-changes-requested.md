# EP-east-ui 验收结论：Changes Requested

reviewer: `claude` · 分支 `feat/fengshui-ui` @ `a692285`（基于 main `9fbd37b`，**5 个提交**）

**先说好的部分。** 客观基线全过：core 154 · llm 182 · web 252、typecheck 0、build 通过，而且 **`lint` exit 0——过了新设的阻塞闸门**（这条你证据包里没提，但确实没破）。测试只有新增、无一条被削弱。四条功能红线我逐条查了都在：`panelProps` 仍按 `inTg` 门控 tabpanel、两步删除确认、`useIsTelegram` 20 个调用点、`effectiveDwellingInput = entitled ? … : undefined` 未动。剪影付费墙的隔离是构造性成立的，我跑变异确认那条测试真会红。

评审还独立核实了**控制流清单**：B–E 四个 Phase 里没有丢失任何交互元素、`inTg` 分支、权益守卫、错误/空/加载态或 hook。**去卡片化本身做得干净。**

**但问题不在你以为的地方。** 你说「纯视觉重设计、无逻辑分支变更、变异验证不适用」——真正的用户可见缺陷恰恰出在那四个「纯视觉」提交里。

---

## 先纠正验收范围

分支上是 **5 个提交**，证据包描述了 4 个。缺的 `d275ca0`（`feat(fengshui): …首揭仪式、盘即导航、剪影付费墙`）是唯一的 `feat` 提交，改了 `fengshui/page.tsx` 235 行、`BaguaWheel.tsx` 109 行，**并且贡献了全部 168 行新增测试**。

评审结论：`d275ca0` **内部没有隐藏内容**，五项都落地且各有能变红的测试（它跑了 a/c/c2/d/e/f/h/i/k/l/s 一批变异确认）。问题只在于它被排除在「变异验证不适用」这句话之外——恰恰是唯一需要变异验证的那个。

---

## 必修 C1 —— TG 深色模式下运势插图永久空白（行为回归，非视觉）

`apps/web/app/calendar/page.tsx:202-220`

Phase D 把可见的 `<img>` 换成了 `<FortuneFrame>` 里的 SVG `<image>`，只留一个残余 `<img>` 专门保留深色变体的 `onError` 兜底：

```jsx
<img src={imgSrc} alt="" aria-hidden className="hidden" loading="lazy"
     onError={() => { if (useDarkFile) setFortuneImgError(true); }} />
```

**这个兜底永远不会触发。** `matchFortuneImage` 按字符串约定**总是**合成 `darkFile` 且刻意不验证存在性（`lib/fortune-images.ts:62-79`，注释写着「不验证文件是否存在（客户端 onError 兜底）」）。而 `apps/web/public/fortune/` 下 **20 个文件里 0 个有 `-dark` 变体**（我独立核实过）。所以 TG 深色下 `useDarkFile` 恒为真、`imgSrc` 恒指向一个必然 404 的路径。

而恢复现在依赖一个 `display:none` **且** `loading="lazy"` 的元素——没有布局盒的元素永不进入视口，Chromium 就永不发起请求，`onError` 永不触发。

改动之前那个会报错的 `<img>` 就是可见的 hero（`9fbd37b` 的 `absolute inset-0 h-full w-full`），懒加载正常工作、404 正常触发、浅色图正常顶上。

**失败场景**：Telegram 深色模式用户打开运势日历，看到一个空的墨线窗框——每天、每条运势。浅色和普通 web 都正常，所以它逃过了检查。

**要求**：让兜底真的可达。可选做法：去掉 `loading="lazy"`（hidden 元素本就不占带宽预算）、或改为在 `FortuneFrame` 的 SVG `<image>` 上直接接 `onError`、或干脆在 `matchFortuneImage` 里不再合成不存在的 `-dark` 路径（既然一个都没有）。第三种最彻底，但要确认将来是否还打算做深色变体。

---

## 必修 C2 —— 一个「产品可信度所系」的领域事实，显示出来却零覆盖

`app/fengshui/__tests__/page.test.tsx:1451-1461` · `app/fengshui/page.tsx:52, 629`

那条 盘即导航 测试**从被测函数自己推导期望值**：

```ts
const directional = fs.remedies.filter((r) => remedyDirection(r.target) !== null);
const dir = remedyDirection(directional[0]!.target)!;   // ← 期望值来自被测函数
```

页面用同一个函数过滤，于是任何映射错误都自洽、都看不见。

评审跑的变异：把 `remedyDirection` 里「先长后短」的顺序倒过来——**正是该函数自己的注释说本仓库已咬过三次的中文方位名子串陷阱**——**69/69 全绿**。而 fixture 里确实有两字方位（`"东南（生气方）"`、`"西南（绝命方）"`），陷阱是活的不是假想。生产中短优先会让 `remedyDirection("东南（生气方）") === "E"`：点东南扇区得到「这个方位暂时没有对应的化解」，点东扇区却显示一条东南的化解。

**更要命的是 Phase D 给每条 web 化解行加了一个渲染出来的方位锚点**（`page.tsx:629`，朱砂宋体 `{DIRECTION_LABEL[dir]}`），而提交信息把这归为纯排版。两个变异：

- 整个删掉锚点 → **69/69 通过**
- 渲染 `DIRECTION_LABEL[dir === "N" ? "S" : "N"]`（给每个用户看错误方位）→ **69/69 通过**

**当前实现是对的，只是测试套件并不知道。**

**要求**：
1. 对 `remedyDirection` 用字面量断言（`expect(remedyDirection("东南（生气方）")).toBe("SE")`），至少覆盖长短同前缀的一对；
2. `dir` 改从硬编码方位取，不要从 SUT 取；
3. 补一条断言：化解行的锚点显示的是期望的那个方位标签。

---

## 必修 I1 —— 首揭仪式会在每次切回命盘 tab 时重放

`app/fengshui/page.tsx:220, 233-235, 756`

`setRevealing(false)` 在 2100ms 有定时清除，`setStaggerIn(true)` **没有对应的复位**。而盘是挂在 `{tab === "chart" && …}` 下条件渲染的，且 `selectDirection` 自己会切到化解 tab。于是：点扇区 → 落到化解 → 点回命盘 → 盘重新挂载、`staggerIn` 仍为 true → 再演一次错峰淡入，最多 630ms 扇区不可见，而这次没有 `CastingOverlay` 解释它在干什么。

`BaguaWheel.tsx:96` 那个 prop 自己的文档就写着「仅首次渲染时传 true」，页面违反了它。变异：把调用点硬编码成 `staggerIn={false}` → **69/69 通过**，没有任何测试守页面到盘的这条接线。

**要求**：在同一个 `setTimeout` 里 `setStaggerIn(false)`；并补一条测试锁住「切走再切回不重放」。

---

## 必修 I2 —— 盘即导航 对辅助技术不可达，而测试看不见这一点

`components/charts/BaguaWheel.tsx:130, 138-141`

可交互扇区是 `<g role="button" tabIndex={0} aria-pressed>`，嵌在 `<svg role="img" aria-label>` 里面。**ARIA 1.2 规定 `img` 是 children-presentational 角色**——用户代理必须不暴露其后代。浏览器照做。

结果：屏幕阅读器用户只得到一张标着「八方吉凶盘」的图片、没有任何按钮；键盘用户得到 8 个没有可读名称的 tab 停靠点。而且没有替代控件可以设置 `dirFilter`——「清除筛选」只在筛选**已存在**之后才出现。

那条 `getByRole("button", { name: … })` 之所以通过，是因为 dom-testing-library **没有实现** presentational-children——**正好在它声称要保证的性质上给了假绿灯**。「键盘可达」那条也只是在 `<g>` 上派发合成 `keyDown`，既没验证 Tab 可达、也没验证可访问名称。

叠加问题：全 app **没有任何 `:focus-visible` 规则**（`grep` 零命中），这次新增的焦点停靠点也没配。

**要求**：`onSelectDirection` 存在时把 svg 的 role 改为 `group`（或 `toolbar`/`application`），非交互时保持 `role="img"`；给扇区加 focus-visible 描边。测试相应改为验证可访问名称。

---

## 必修 I3 —— 五处对比度往错误方向走了，四处在「纯视觉」提交里

**你的头条指标是对的**：`#a84638` 对白 = **5.84:1** ✓（你说 5.8）。`--color-muted` 也全部过 AA。浅色朱砂全面改善（纸底 4.31→5.40）。

但：

| 配对 | 改前 | 改后 | 位置 |
|---|---|---|---|
| TG 深色朱砂 / 深色纸底 | 4.80 | **4.41** | `globals.css:176`（B）|
| TG 深色朱砂 / 深色 surface | 4.45 | **4.09** | 同上 |
| `favorableToday` 今日吉标记 | 7.45 | **2.48** | `calendar/page.tsx:228`（D）|
| NatalWheel 星座符号 | 3.93 | **2.53** | `NatalWheel.tsx:90`（E）|
| 居所「编辑中」指示 | 5.40（2px 朱砂描边）| **~1.3**（1px line-strong + tint 底）| `dwellings/page.tsx:229`（D）|

TG 深色朱砂那条波及面最广：`var(--color-cinnabar)` 在全站被当**正文色**用（askMira 链接、清除筛选、错误文案），TG 深色下白字压朱砂按钮是 4.37:1。

Phase E 把 NatalWheel 的 `#8C7F66` 换成 `--color-metal` 标为「令牌化」，听起来中性，实际是 17px 符号上 1.4 倍的对比度损失——那些符号是每个宫位的星座标识。居所「编辑中」那处的注释写着「一眼可辨」，而实测对 tint 和 paper 都是 1.28–1.38:1（WCAG 1.4.11 对状态指示要求 3:1）。

**要求**：这五处逐一调回 AA 以上。TG 深色朱砂那条优先——它是唯一波及全站正文的。

---

## 必修 I4 —— 约 15 处硬编码中文 + 3 个被孤立的 i18n 键，而这是英文优先的产品

`chart/page.tsx:192,197,202,207` · 各 `PageHeader` 调用点 · `CastingOverlay.tsx:50`

Phase D 把 `t("chart.baziTitle")` / `t("chart.ziweiTitle")` / `t("chart.westernTitle")` 换成了字面量 `"四 柱"` / `"紫 微"` / `"星 盘"`。这三个键现在**引用数为 0**（我独立核实过），而它们承载的恰恰是英文用户依赖的注解——"BaZi Four Pillars"、"Zi Wei Dou Shu · Twelve Palaces"、"Western Natal Chart · Psychological Reflection"。

**en locale 用户现在在 `/chart` 上看到四个光秃秃的中日韩字符标题，没有任何兜底。**

同样的模式覆盖每一个 `PageHeader kicker`（账户/流日/命盘/档案/起盘/居所/物件/境）、`Section`/`ChartBlock` 标签、首页的「— 卷 首 —」「— 目 录 —」，以及 `CastingOverlay.tsx:50` 把英文 `"Casting today's reading"` 换成了 `"排 盘 中"`。这些文件**都已经 import 了 `useT`**。

CURRENT.md 披露了机制（「拉丁 kicker 全清」），但没说替代物在构造上是单语的。

⚠️ 注意这与 `EP-fs-en` 是同一条战线：CLAUDE.md 写明首发海外、英文优先，而风水 flag 已经线上开启。

**要求**：眉标与标题回到 i18n；三个孤立键要么恢复引用、要么连同英文注解一起删（但删之前想清楚英文用户看什么）。

**i18n 结构本身没问题**：新增键中英双份齐全且英文是真内容。

---

## 必修 I5 —— 起盘主 CTA 的 hover 反馈是死代码

`app/reading/ReadingForm.tsx:231`

`className="… hover:bg-cinnabar-press …"` 和 `style={{ background: "var(--color-cinnabar)" }}` 并存。**内联样式优先级高于生成的 `.hover\:bg-cinnabar-press:hover` 规则**，press 色永不生效；而同一次编辑里 `hover:-translate-y-0.5` 和 `shadow-btn` 都被移除了。净效果：`/reading` 的主 CTA 现在完全没有 hover 反馈。

**要求**：底色改用 class，或把 hover 写进 CSS 规则。

---

## 顺手修的 Minor

- **交错动画只测了一半**：组内 rank 顺序反转、吉方组内打乱（保持生气第一）两个变异都 69/69 通过。三条断言（生气=0ms、8 个不同 delay、绝命>生气）被「任何把生气放第一的分组」共同满足。改为断言完整的期望 delay 序列。
- **扇区再点取消筛选零覆盖**：`const next = d;`（永不清除）→ 69/69 通过，而 `page.tsx:239` 的注释明写「再点同一扇区取消过滤」。
- **`prefers-reduced-motion` 没有中和 `animation-delay`**：`globals.css:133-140` 覆盖了时长与迭代但没覆盖延迟，内联 `animationDelay` 最多 630ms 仍让扇区停在 `opacity:0`。不是死锁，但正好是要求减少动效的用户多等 630ms 空白。
- **剪影测试选择器脆弱**：`document.querySelector('svg[aria-hidden="true"]')` 取第一个匹配。今天付费墙区域恰好只有 1 个，但将来在它上方加任何装饰性图标，四条断言会集体指向错误元素。加 `data-testid`。
- **`verdicts` 放宽为可空但用了 `verdicts!`**（`BaguaWheel.tsx:126`）：不传 `silhouette` 却传 `null` 的调用方会拿到运行时 `TypeError` 而不是类型错误。改判别联合恢复保证。
- **化解列表字号偏小**：action 15→13px、traditional/modern 13→12px、effort 标签 12→**10px** 且 CJK 上带 0.3em 字距。对比度过关，10px 中文是问题。`/reading` 引导段和物件页副标题也各降了一档。
- **日历 宜/忌 hero chips 被静默移除**（不在「深色 hero」披露范围内）。它们带着仅有的硬编码兜底（`"顺势而为"`/`"勿强求"`）；存活的下方列表用 `behavior?.do ?? fortune.auspicious`，而 `??` 接不住 `[]`。LLM 返回空 `do`/`dont` 时现在是一个标题下面空列表。
- **本分支孤立但未清理**：`@keyframes zjPop`、`zjBell`、`.zj-pulse` + `zjPulse`（在 `d275ca0` 时都还有消费者，被 C/D 孤立），以及 `public/hero/hero-bg.jpeg`（177KB，0 引用）。你披露的 `fortune-hero-img` 清理**是准确且完整的**。
- **设计源文件不在版本库里**：`globals.css:5` 和新的 CURRENT.md 行都引用 `docs/assets/zhaojian-eastern-ui.pen`，而它**未被追踪**。按现状合并会留下两个悬空引用。
- **CURRENT.md 那行不准确**（`.agent/CURRENT.md:140`）：「TG 原生臂与全部交互逻辑零变化」为假——`d275ca0` 加了盘即导航、首揭仪式、剪影付费墙，且 `d275ca0` 完全没被提及。

---

## 交付契约

```bash
pnpm --filter @eamvp/web test   # 基线 252
pnpm typecheck                  # exit 0
pnpm --filter @eamvp/web lint   # exit 0 ⚠️ 现在是阻塞闸门，0 errors 才算过
```

**变异验证（本轮必须实跑，「纯视觉」不再适用）**：

| # | 变异 | 期望 |
|---|---|---|
| A | `remedyDirection` 改成先短后长 | C2 新增的字面量断言变红 |
| B | 删掉化解行的方位锚点 | C2 新增的锚点断言变红 |
| C | 调用点硬编码 `staggerIn={false}` | I1 新增的「切走再切回不重放」测试变红 |
| D | 让扇区交互无条件生效（不传 `onSelectDirection` 也可点） | 向后兼容那条变红 |

推理不算数，只认实跑。前几轮这个仓库累计 12 次「断言抓不到它声称要防的 bug」，本轮评审又在新代码里找出 6 个能全绿通过的变异。
