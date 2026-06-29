# 照见 TG 原生 UI · Round 2（暗态 bug 修复 + 深色专图 + 起盘表单 + 导航）Implementation Plan

> 执行者 `kimi`，reviewer `claude`。kimi 只改列出文件、不 commit、密钥只读 env。本地验证由 claude（启 dev 前 `set -a; . ./apps/web/.env.local; set +a`；浏览器 console `document.documentElement.setAttribute('data-tg-theme','dark')` 看暗态、`'light'` 看亮态、`removeAttribute` 看非 TG）。

**Goal:** 修复暗态残留 bug（工具类不跟随主题→白卡/白按钮），并继续：深色版专图、起盘表单深度原生、TG 导航原生。

**根因（务必理解）:** `apps/web/app/globals.css` 用 `@theme inline {...}`。Tailwind v4 中 `inline` 让颜色工具类（`bg-surface`/`text-ink`/`bg-ink`/`border-line`/`text-muted`…）编译为**字面值**、**不引用 CSS 变量**，故 `html[data-tg-theme="dark"]` 的变量 override 对工具类无效（仅内联 `style={{...var()}}` 生效）。

**Tech Stack:** Tailwind v4 `@theme` · CSS 变量 · Next 16 client · `@/components/tg/*`、`@/lib/tg/*`。

## Global Constraints
- **非 TG（web）+ 亮态视觉零变化**：去 `inline` 后亮态工具类解析 var()→与现 :root 同值→像素一致；暗态仅 `html[data-tg-theme]` 作用域。每改务必 claude 三态核对（亮/暗/非TG）。
- 深色水墨基准见 `tg-native-preview.html`。
- 每任务 `pnpm --filter @eamvp/web build` 通过。

---

## Task 1（kimi）：暗态正确性根因修复（@theme inline → @theme + 强调面板 + geocode 按钮）— 关键，先做

**Files:** Modify `apps/web/app/globals.css`、`apps/web/components/charts/BaziPillars.tsx`、`apps/web/components/charts/ZiweiBoard.tsx`、`apps/web/app/reading/ReadingForm.tsx`

- [ ] Step 1: `globals.css` 第 7 行 `@theme inline {` → `@theme {`（去掉 `inline`）。这让所有颜色工具类（bg-surface/text-ink/bg-ink/border-line/text-muted/bg-tint/text-cinnabar 等）改为 `var(--color-*)` 引用 → 暗态 override 全局生效。**不改 @theme 内的令牌值。**
- [ ] Step 2: 处理「深色强调面板」双关（`bg-ink`+`text-on-ink` 是「深底+浅字」的强调面板，如八字柱头、紫微中宫；暗态 `--color-ink` 翻浅会破）。在 `globals.css`：
  - `:root`(@theme 外，或 @theme 内新增令牌)加：`--color-panel-strong:#1f1d19; --color-on-strong:#f6f5f1;`
  - `html[data-tg-theme="dark"]` 块加：`--color-panel-strong:#241f19; --color-on-strong:#ece6da;`（暗态强调面板=略亮的深墨面板+浅字，保持「强调」且不翻白）
- [ ] Step 3: 把强调面板用法从 ink→panel-strong：
  - `BaziPillars.tsx` line ~64-65：`background:"var(--color-ink)"`/`color:"var(--color-on-ink)"` → `"var(--color-panel-strong)"`/`"var(--color-on-strong)"`。
  - `ZiweiBoard.tsx` line ~120：`className="bg-ink text-on-ink ..."` → 用内联 `style={{ background:"var(--color-panel-strong)", color:"var(--color-on-strong)" }}`（去掉 bg-ink/text-on-ink 类）；`text-on-ink-gold`(line 131/143) 保留（金色强调，亮暗皆可读）或改内联 `var(--color-on-ink-gold)`。
  - 注意：`text-ink`/`text-ink-2`/`text-muted` 作为**文字色**的工具类**保留**（去 inline 后它们会跟随暗态变浅，正确）。仅「面板底色 bg-ink」需换 panel-strong。
- [ ] Step 4: geocode 「查找」按钮（`ReadingForm.tsx` line ~174）：`background:"var(--color-ink)"` + `text-on-ink` → 改为次级按钮：`style={{ background:"var(--color-tint)", color:"var(--color-ink)", border:"1px solid var(--color-line)", borderRadius:"var(--radius-button)" }}`、去掉 `text-on-ink` 类。亮暗皆可读。
- [ ] Step 5: build；claude 三态核对：暗态下八字/紫微/西方卡为深色、强调面板为深墨+浅字、查找按钮可读、文字可读；亮态与非 TG 与现状像素一致。提交 `feat(tg-ui): 暗态根因修复(@theme 去 inline + 强调面板 + geocode 按钮) [EP-tg-ui-r2-1]`

**验收：** 暗态全站工具类跟随（无白卡/白按钮）；强调面板深墨+浅字；亮态/非 TG 零变化；build 通过。

---

## Task 2（kimi）：深色版专图机制（运势框景图 + 首页 hero）

**Files:** Modify `apps/web/lib/fortune-images.ts`、`apps/web/app/calendar/page.tsx`、`apps/web/app/page.tsx`；（资产目录约定，图后补）
- [ ] Step 1: `fortune-images.ts`：`matchFortuneImage` 增可选 `theme:"light"|"dark"`，dark 时优先返回同名 `-dark` 变体（约定 `public/fortune/<name>-dark.<ext>`），不存在则回退原图（让 Task1 之外的 `.fortune-hero-img` brightness 滤镜兜底）。导出一个 `hasDark(name)` 或在返回对象加 `darkFile?`。
- [ ] Step 2: `calendar/page.tsx`：读当前 `data-tg-theme`（用 state+MutationObserver，或复用 `DarkImage` 思路），dark 时用 `darkFile ?? file` 作 `<img src>`；仍保留 `fortune-hero-img` 类作滤镜兜底（dark 专图存在时滤镜可不叠加——给专图加类 `has-dark` 时禁用滤镜：globals `html[data-tg-theme="dark"] .fortune-hero-img.has-dark{filter:none}`）。
- [ ] Step 3: 首页 hero（`page.tsx` 的 `/hero/hero-bg.jpeg`）：同理支持 `hero-bg-dark.jpeg`（dark 时用），不存在则 Task1 的 hero 渐变兜底（已用 var(--color-paper) 融入）。
- [ ] Step 4: 占位：暂不放真深色图（用户后补，丢进 `public/fortune/*-dark.*` 与 `public/hero/hero-bg-dark.jpeg` 即生效）。build 通过。提交 `feat(tg-ui): 深色版专图机制(运势/hero, 缺图回退滤镜) [EP-tg-ui-r2-2]`
> 出图（用户）：深色水墨版运势框景 + 首页氛围图，命名加 `-dark`，同尺寸。

**验收：** dark 时存在 `-dark` 专图则用之、否则滤镜兜底；亮态/非 TG 不变；build 通过。

---

## Task 3（kimi）：起盘表单深度原生

**Files:** Modify `apps/web/app/reading/ReadingForm.tsx`
- [ ] Step 1: 性别用**分段控件**（两枚 pill：男/女，选中 cinnabar）替代下拉「请选择」；其值进表单（hidden input 或 state）。
- [ ] Step 2: 出生日期/时辰输入在暗态可读（Task1 后工具类已跟随；复核 `field` 类/`fieldStyle` 用令牌，placeholder 用 `text-muted`，对比足够）；日期/时辰用原生 `<input type="date">`/`<input type="time">`（若现已是则保留）。
- [ ] Step 3: 出生地：geocode 结果列表用原生 cell 样式（`Group/Cell` 或令牌化的 list，暗态可读）；选中项高亮。
- [ ] Step 4: 间距/分组贴近 TG（Section 分组）；不破坏现有提交逻辑与非 TG 外观（TG 专属变化包 `isTelegram()`，通用样式改令牌不影响亮态）。
- [ ] Step 5: build + claude 三态核对。提交 `feat(tg-ui): 起盘表单深度原生(分段性别/暗态输入/geocode cell) [EP-tg-ui-r2-3]`

**验收：** 起盘表单在 TG 暗态原生可读、性别分段；非 TG 不破；build 通过。

---

## Task 4（kimi）：TG 导航原生（首页 hub + 返回）

**Files:** Modify `apps/web/app/page.tsx`；（如需）Create `apps/web/components/tg/TgHubNav.tsx`
> 约束：TG MainButton 占据底部，**不**做与之冲突的底部 tab bar。导航走「首页原生 hub（cells）+ 全局 BackButton + 各页顶部入口」。
- [ ] Step 1: `page.tsx` 首页在 `isTelegram()` 时渲染**原生 hub**：用 `Group/Cell` 列出 运势/命盘/本命之灵/档案（icon+标题+副文+chevron，点击 `router.push`），替代现有 web 入口大图卡片；非 TG 保留现首页。
- [ ] Step 2: 确认 `useTgBackButton` 已在各非根页生效（命盘/运势/灵/档案/起盘）——若未接入，在这些页顶部各调用一次 `useTgBackButton()`（根=`/`）。逐页加（client 组件）。
- [ ] Step 3: build + claude 三态核对（TG 首页 hub、返回键流转；非 TG 首页不变）。提交 `feat(tg-ui): TG 导航—首页原生 hub + 全局 BackButton [EP-tg-ui-r2-4]`

**验收：** TG 首页为原生 hub、各页有返回键、流转顺；非 TG 首页不变；build 通过。

---

## 上线（claude）
全 task accepted + core/llm 测 + web build(双 flag) 全绿 → 合 main → push 部署。真机三态回归。更新 CURRENT.md + memory。

## 编排
owner kimi / reviewer claude（pact `tg-ui-r2`）。波次：T1(bug,关键)→T2(深色专图机制)→T3(起盘表单)→T4(导航)。claude 每波 build+三态核对(亮/暗/非TG)+审+提交+accept；末尾合并部署。
