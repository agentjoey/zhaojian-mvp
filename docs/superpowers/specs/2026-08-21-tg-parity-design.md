# EP-tg-parity — Telegram Mini App 贴近 web 当代东方编辑式设计

> 状态：设计定稿，待 kimi 实施、claude 验收 · 作者：claude · 日期：2026-08-21 · 关联：`.agent/BACKLOG.md` EP-tg-parity 条目、`.agent/CURRENT.md` 2026-06-29「TG 原生 UI 地基」历史决策

## 0. 背景与决策

TG Mini App 此前刻意走「跟随 Telegram 主题的原生感」路线（2026-06-29，`EP-tg-ui` 子项目1）：`components/tg/native.tsx` 提供 `Section`/`Group`/`Cell`/`Segmented`/`Bubble` 一套模仿 iOS/Telegram 系统 UI 的组件（卡片边框+阴影+圆角、色块图标、iOS 分段胶囊），与 web 侧的编辑式设计（细线分隔列表、宋体标题、无卡片）完全独立，只共享 CSS 变量令牌。

Owner 明确选择：**这次要让 TG 的视觉贴近 web 的「当代东方编辑式设计」，不只是信息架构对齐**（即不满足于「TG 有对应入口」，要让 TG 内容区读起来和 web 是同一套设计语言）。

**关键澄清（研究后发现，非直觉）**：这次改动的实际代码footprint远小于「12 个页面」听起来的规模——

- 10 个业务页面（`chart/page.tsx`、`chart/SpiritPanel.tsx`、`dream/page.tsx`、`account/page.tsx`、`profiles/page.tsx`、`reading/page.tsx`、`fengshui/page.tsx`、`fengshui/DwellingForm.tsx`、`fengshui/ObjectAdvisorForm.tsx`、`fengshui/dwellings/page.tsx`）**已经全部使用 `PageHeader` 组件**渲染页头（无一处手写重复页头），也已经全部通过 `import { Group, Cell, Segmented } from "@/components/tg/native"` 调用共享组件——**这些页面本身的 JSX 不需要改一行**，它们会在共享组件重新设计后自动获得新样式。
- 唯一手写页头、没有复用 `PageHeader` 的地方，是 **`app/page.tsx`（首页）的 TG 分支**（第 138-160 行）。
- 唯一存在真正**重复实现**（而非共享组件调用）的两处：
  1. `SpiritPanel.tsx` 的聊天气泡（第 280-316 行）手写了一份和 `Bubble` 组件几乎相同的markup，没有导入共享组件。
  2. `DwellingForm.tsx` 的 `OptionButtons`（第 272-292 行）是 web 侧本地重新实现的「互斥选项行」，和 `Segmented` 组件同语义不同代码。

所以整个改动集中在 **4 个源文件**：`components/tg/native.tsx`（核心重做）、`app/page.tsx`（首页头部改用 PageHeader）、`SpiritPanel.tsx`（气泡改用共享组件）、`DwellingForm.tsx`（删本地重复实现）。其余 8 个业务页面**不改代码**，但它们的**测试文件**里如果断言了旧样式（卡片边框/阴影/圆角 class）需要跟着更新——这是机械性回归修复，不是设计决策。

## 1. 保持不变的部分

- Telegram 平台原生机制：返回按钮、底部 MainButton、haptics、跟随 TG 明暗主题的令牌桥（`TgUiProvider.tsx`）——这次只重做**内容区**的排版/字体/列表样式，不碰平台交互层。
- 所有 10 个业务页面的 `inTg` 三元分支结构——分支判断逻辑不变，只是分支里调用的共享组件外观变了。
- CSS 变量令牌系统（`--color-*`/`--radius-*`）不新增令牌，全部复用现有值；因此 TG 深色模式自动继续工作，不需要额外适配。

## 2. `components/tg/native.tsx` 重新设计

### 2.1 `Group`
现状（第 24-38 行）：`border` + `boxShadow: var(--shadow-card)` + `borderRadius: var(--radius-card)` + `background: var(--color-bg2)` 的卡片容器，子项间 `border-t`。

改为：去掉 `border`/`boxShadow`/`borderRadius`/`background` 四项，容器本身加 `borderTop: 1px solid var(--color-line)`（模仿 web 首页 `ENTRIES` 列表 `app/page.tsx:101` 的 `borderTop` 起始线），子项间的 `border-t` 分割线保留（这就是每行之间的细线，逻辑不变，只是不再被包在卡片里）。

### 2.2 `Cell`
现状（第 40-79 行）：`icon` 渲染在 30×30px、`accent` 色填充背景、白字的圆角方块里（第 60-65 行）。

改为：**去掉背景方块**，`icon` 字符直接用 `accent` 颜色渲染为纯文字（`color: accent`），字号从当前 16px 改为 **18px**（无背景后字符本身要承担视觉重量，略微放大），字体沿用 `font-serif`（现有的 `font-serif text-[16px]` 已经是宋体，只需去掉容器背景/圆角/白字，改成 `color: accent` 的裸字符 + 18px）。标题/副标题/chevron 三部分不变（第 66-76 行原样保留）。

**不采用** `SealIcon`（`components/ui.tsx:74`，profiles 页 web 分支用的填色方章）——已与 owner 确认，维持裸字符方案，不复用 `SealIcon`。

### 2.3 `Segmented`——两种模式对应两种不同的既有 web 视觉规范

`Segmented` 现有两种语义模式（第 92-160 行注释已写明）：传 `idBase` 是真 tab（tablist/tab + ARIA 全套），不传是互斥选项组（role="group"）。**这两种模式在 web 侧本来就有两套不同的既有视觉规范，各自贴齐各自的规范，不要合并成一种样式**：

- **Tab 模式**（`idBase` 存在）→ 贴齐 `fengshui/page.tsx:714-726` 的现有 web tab 行：无背景色块，激活态 `color: var(--color-cinnabar)` + `borderBottom: 2px solid var(--color-cinnabar)`，未激活态 `color: var(--color-ink-2)` + `borderBottom: 2px solid transparent`，横向 `flex` 排列，整行底部无需额外描边（每个 tab 自带 2px 底线，激活/未激活都占位避免跳动）。
- **组模式**（`idBase` 为空）→ 贴齐 `DwellingForm.tsx:274-292` 的 `OptionButtons`：每个选项是独立描边按钮（`border-radius: var(--radius-button)`），激活态 `borderColor`/`color` 都是 `var(--color-cinnabar)`，未激活态 `borderColor: var(--color-line)` + `color: var(--color-ink)`，背景恒透明，横向 `flex gap-2` 等宽排列（`flex-1`）。

现有的 `background: var(--color-bg2)` 外层容器 + 内层胶囊背景切换（第 122-159 行）两种模式共用的实现要拆开：按 `idBase` 是否存在分叉渲染两套内部样式，ARIA 属性逻辑（tablist/tab vs group/aria-pressed，方向键漫游）保持完全不变，只改视觉。

### 2.4 `Bubble`——样式本身不用改

`Bubble`（第 162-187 行）现状已经和 web 侧 `SpiritPanel.tsx` 手写的气泡（第 280-316 行）视觉上**几乎一模一样**（同样的 `rounded-2xl`、同样的「user=cinnabar 填充白字 / spirit=paper 底+描边」规则）。这一项**不需要视觉重新设计**，只需要下面 3.3 节的代码去重。

## 3. 文件改动清单

### 3.1 `components/tg/native.tsx`
按 2.1-2.3 重写 `Group`/`Cell`/`Segmented` 的内部样式（props 签名、导出名、`Section`/`Bubble` 结构不变——所有调用方零改动）。

### 3.2 `app/page.tsx`（首页）
第 138-146 行的手写 TG 头部：
```tsx
<div className="mb-5 pb-5" style={{ borderBottom: "1px solid var(--color-line)" }}>
  <p className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>
    — {t("home.kickerHero")} —
  </p>
  <h1 className="mt-3 font-serif text-[24px] font-bold tracking-[0.08em]">{t("common.brand")}</h1>
  <p className="mt-1 text-[13px] text-muted">{t("home.tg.tagline")}</p>
</div>
```
改为直接调用：
```tsx
<PageHeader kicker={t("home.kickerHero")} title={t("common.brand")} annotation={t("home.tg.tagline")} />
```
（需要新增 `import { PageHeader } from "@/components/PageHeader";`。注意 `PageHeader` 的 `title` 渲染为 `text-[28px]`，比原手写的 `text-[24px]` 略大——这是可接受的、有意的统一，不是需要额外还原的差异。）
第 147-158 行 `<Group>`/`<Cell>` 调用代码不变（自动获得新样式）。

### 3.3 `chart/SpiritPanel.tsx`
第 280-316 行的手写气泡 markup 改为导入并调用 `Bubble`：
```tsx
import { Bubble } from "@/components/tg/native";
// ...
{messages.length === 0 && isTelegram() && (
  <div className="flex justify-start"><Bubble role="spirit">{t("spirit.emptyPrompt")}</Bubble></div>
)}
{messages.map((m) => (
  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
    <Bubble role={m.role === "user" ? "user" : "spirit"}>
      {m.role === "user" ? (
        <p className="whitespace-pre-wrap">{m.content}</p>
      ) : m.content ? (
        <div className="reading-prose"><Markdown text={m.content} /></div>
      ) : streaming ? (
        <span className="inline-block animate-pulse text-cinnabar">▋</span>
      ) : null}
    </Bubble>
  </div>
))}
```
**这段代码在 TG 和非 TG 都会渲染**（原代码就没有 `inTg` 分支，第 280 行判断只是 `isTelegram()` 决定是否显示空态提示，气泡本身两端共用）——因此 `Bubble` 组件本身必须同时支持当前两处调用点的所有内容形态（纯文本 / Markdown / 流式光标），不能假设只有简单文本。`Bubble` 现有的 `max-w-[84%]` 与 `SpiritPanel.tsx` 原手写的 `max-w-[82%]` 有 2 个百分点的差异——直接采用 `Bubble` 现有的 84%，不需要专门改 `Bubble` 去对齐 82%。

### 3.4 `fengshui/DwellingForm.tsx`
删除第 272-292 行的 `OptionButtons` 函数定义；删除其 2 处调用点（第 175-176 行 `kind` 选择、第 189-190 行 `tenancy` 选择）连同包裹它们的 `inTg ? <TgSegmented.../> : <OptionButtons.../>` 三元分支，改为两处都**无条件**调用（重新设计后的）`Segmented`（组模式，不传 `idBase`）：
```tsx
<Segmented
  ariaLabel={t("fengshui.dwelling.kindLabel")}
  options={[
    { value: "home" as const, label: t("fengshui.dwelling.kindHome") },
    { value: "office" as const, label: t("fengshui.dwelling.kindOffice") },
  ]}
  value={kind}
  onChange={setKind}
/>
```
（`tenancy` 同理）。原来区分 `TgSegmented`（导入自 native.tsx）和 web 本地 `OptionButtons` 的重命名注释（第 11 行 `import { Segmented as TgSegmented }`）可以随之清理，改回直接 `import { Segmented } from "@/components/tg/native"`（不再需要改名消歧，因为 web 分支不再有同名本地组件）。

## 4. 不做的事（明确排除，避免 kimi 自行扩大范围）

- 不改 `fengshui/page.tsx`/`fengshui/dwellings/page.tsx`/`profiles/page.tsx`/`ObjectAdvisorForm.tsx`/`account/page.tsx`/`dream/page.tsx`/`chart/page.tsx`/`reading/page.tsx` 里已有的 `inTg` 三元分支结构或调用代码——它们已经在用共享组件，改共享组件本身就够。
- 不改 `AppShell.tsx` 的 `{!tg && (...)}` 导航壳结构——TG 首页导航仍然是 `app/page.tsx` 里独立的 `TG_ENTRIES`，这次不改「TG 有没有桌面/移动导航栏」这个既有决策。
- 不碰 TG 平台机制（Back/MainButton/haptics/主题桥）。
- 不新增 CSS 变量令牌。

## 5. 测试影响

`native.tsx` 目前没有独立的单元测试文件——覆盖全部来自消费页面的测试。以下测试文件如果断言了 `Group`/`Cell`/`Segmented`/`Bubble` 渲染出的具体样式（class 名、`style` 属性里的 `border`/`boxShadow`/`borderRadius`/`background` 具体值），需要按 2.1-2.4 的新样式更新断言；如果只断言文本内容/点击行为（`onClick`→`router.push` 之类），不受影响：

- `apps/web/app/profiles/__tests__/page.test.tsx`（TG 分支 `Group`+`Cell` 渲染）
- `apps/web/app/fengshui/__tests__/page.test.tsx`（TG 分支 `Group`+`Cell` 化解清单、`Segmented` tab）
- `apps/web/app/fengshui/dwellings/__tests__/page.test.tsx`（TG 分支 `Group`+`Cell`）
- `apps/web/app/fengshui/__tests__/DwellingForm.test.tsx`（`TgSegmented`/`OptionButtons` 两个分支的断言要合并成一个，因为三元分支被删除）
- `apps/web/app/fengshui/object/__tests__/page.test.tsx`（`ObjectAdvisorForm` 的 `Group` 渲染）
- `apps/web/app/chart/__tests__/SpiritPanel.test.tsx`（若存在——气泡 markup 改用 `Bubble` 组件后，断言气泡具体 class/style 的用例要跟着改）
- `apps/web/app/__tests__/page.test.tsx`（首页 TG 分支头部断言，从手写 markup 断言改为 `PageHeader` 渲染断言）

具体每条断言现在写的什么、要改成什么，留给实施阶段（implementation plan）逐条列出——这里只标出「哪些文件会受影响」。

## 6. 验收标准

1. `pnpm --filter @eamvp/web test` 全绿（含上述更新后的断言）。
2. `pnpm run typecheck` 三包全绿（注意：apps/web 顶层已有 7 处**既存**、与本次改动无关的类型错误——EP-web-typecheck-debt，本次改动不必须修，但也不能新增）。
3. 视觉验收（claude 验收阶段人工过一遍，无需自动化）：TG 内首页/命盘/风水/档案等页面的列表不再有卡片边框/阴影/圆角，读起来和对应的 web 版本列表是同一套排版语言；分段控制（tab 模式 vs 组模式）分别对齐 fengshui tab 行与 `OptionButtons` 的既有样式；聊天气泡视觉不变（因为本来就一致）。
