# 照见 TG 原生 UI · 各界面原生重排 + 深色正确性 Implementation Plan

> 执行者 `kimi`，reviewer `claude`。kimi 只改列出文件、不 commit、密钥只读 env。本地验证由 claude（启 dev 前 `set -a; . ./apps/web/.env.local; set +a`；可临时 `document.documentElement.setAttribute('data-tg-theme','dark')` 在浏览器看暗态）。

**Goal:** 在已落地的「主题桥+chrome+组件」地基上，把各界面做成跟随明/暗主题、类原生的体验，并修复深色正确性（令牌补全 + 硬编码浅色 + 浅底位图）。

**Architecture:** 令牌驱动——补全 `html[data-tg-theme="dark"]` 下所有 surface/line/tint 令牌，使现有 `Card`/页面自动适配；硬编码浅色改令牌；浅底装饰位图在暗态加深色蒙版；关键流程接 MainButton/BackButton；列表/区块用原生组件。

**Tech Stack:** Next 16 client · CSS 变量(globals.css) · `@/components/tg/{native,…}` · `@/lib/tg/{ui,client,theme}`。

## Global Constraints
- **非 Telegram（web）行为/视觉零变化**：所有 TG 专属逻辑包在 `isTelegram()`；令牌覆盖只在 `html[data-tg-theme]` 作用域（非 TG 无此属性→零影响）。深色令牌只在暗态生效，亮态(TG light)沿用素白。
- 深色水墨基准值见已交付 `tg-native-preview.html` 与地基 spec。朱砂暗态 `#d4564a`。
- 每任务 `pnpm --filter @eamvp/web build` 通过；claude 复核「非 TG 浏览器视觉不变」+「暗态无浅色残留」。
- 全程中文。复用现有 `Card`、`native.tsx`、`useTgMainButton/useTgBackButton/haptics`。

## File Structure
- Modify `apps/web/app/globals.css` — 补全暗态令牌（surface/float/tint/backdrop/divider/spoke + 阴影）。
- Modify `apps/web/app/reading/ReadingForm.tsx` — 起盘原生（输入/MainButton/error token）。
- Modify `apps/web/app/chart/page.tsx` — 命盘原生（section/解读生成 MainButton/error token）。
- Modify `apps/web/app/calendar/page.tsx` + `apps/web/lib/fortune-images.ts`(若需) — 运势原生 + 框景图暗态蒙版。
- Modify `apps/web/app/profiles/page.tsx` — 档案 native cells。
- Modify `apps/web/app/page.tsx` — 首页 hero 渐变暗态化（含 BackButton 根页不显）。
- 新增（如需）`apps/web/components/tg/DarkImage.tsx` — 浅底位图暗态蒙版包装。

**Pact** feature `tg-ui-surfaces`。

---

## Task 1（kimi）：深色正确性（令牌补全 + 硬编码浅色 + 位图蒙版）— 关键，先做

**Files:** Modify `apps/web/app/globals.css`；Create `apps/web/components/tg/DarkImage.tsx`；Modify `apps/web/app/reading/ReadingForm.tsx`、`apps/web/app/chart/page.tsx`、`apps/web/app/chart/SpiritPanel.tsx`、`apps/web/app/page.tsx`

- [ ] Step 1: `globals.css` 的 `html[data-tg-theme="dark"]` 块补全（在现有 dark 块内补这些，值为深色水墨）：
```css
  --color-surface:#1a1712;   /* 卡片/浮层 */
  --color-float:#1a1712;
  --color-tint:#221e18;      /* 区块浅底/chip */
  --color-backdrop:#0a0907;
  --color-divider:#2a2620;
  --color-spoke:#3a352c;     /* 命盘淡线 */
  --color-ink-2:#c4bcae;     /* 次文字(确认已有则略) */
  --shadow-card:0 6px 20px rgba(0,0,0,.5);
  --shadow-card-hover:0 12px 28px rgba(0,0,0,.6);
  --shadow-soft:0 6px 22px rgba(0,0,0,.45);
  --shadow-panel:0 18px 50px rgba(0,0,0,.6);
```
  并加一个暗态错误框令牌：`--color-error-bg:#FBEEEC; --color-error-line:#EFD6D2;` 放 `:root`(亮)，dark 块覆盖 `--color-error-bg:#2a1714; --color-error-line:#4a2a23;`。
- [ ] Step 2: 把硬编码浅色改令牌：`ReadingForm.tsx`/`chart/page.tsx`/`SpiritPanel.tsx` 里 `background:"#FBEEEC"…border "1px solid #EFD6D2"` → `background:"var(--color-error-bg)"`、`border:"1px solid var(--color-error-line)"`（`color:"var(--color-seal)"` 保留，暗态 seal 仍可见，或一并在 dark 块设 `--color-seal:#e0786c`）。dark 块加 `--color-seal:#e0786c;`。
- [ ] Step 3: `DarkImage.tsx`（"use client"）：包装浅底装饰位图，暗态(检测 `document.documentElement.getAttribute('data-tg-theme')==='dark'`，用 state+MutationObserver 或简单读取)加一层 `linear-gradient` 深色蒙版 overlay（`rgba(16,14,11,.5)`）使其融入暗底。导出 `DarkImageOverlay({children})`：相对定位 + 暗态绝对定位蒙版层。
- [ ] Step 4: `page.tsx` 首页 hero 渐变 `rgba(246,245,241,.x)…#F6F5F1` → 用 `var(--color-paper)`（rgba 用 `color-mix(in srgb, var(--color-paper) X%, transparent)` 或直接渐变到 `var(--color-paper)`）使暗态过渡到深色底。
- [ ] Step 5: build；claude 浏览器暗态(强制 data-tg-theme=dark)核对：卡片/区块/线/错误框/首页 hero 全深色无浅块。提交 `feat(tg-ui): 深色正确性—令牌补全+硬编码浅色+位图蒙版 [EP-tg-ui-s1]`

**验收：** 暗态下卡片/chip/分隔/盘线/错误框/首页 hero 全为深色水墨；亮态与非 TG 不变；build 通过。

---

## Task 2（kimi）：起盘 /reading 原生

**Files:** Modify `apps/web/app/reading/ReadingForm.tsx`
**Consumes:** `useTgMainButton`/`haptics`(ui.ts)、`isTelegram`(client.ts)。
- [ ] Step 1: TG 内主操作「为我起盘」用 `useTgMainButton({ text:"为我起盘", onClick:()=>submit, enabled:<表单可提交>, visible:isTelegram() })`；隐藏页内提交大按钮（`{!isTelegram() && <按钮>}`）。submit 抽成可被 hook 调用的函数（现有 onSubmit 逻辑包一层）。
- [ ] Step 2: 输入区在暗态可读（依赖 T1 令牌；input 用 `var(--color-surface)`/`var(--color-line)`/`var(--color-ink)`，复核占位/边框对比）。
- [ ] Step 3: `haptics.light()` 于提交、`haptics.error()` 于校验失败。
- [ ] Step 4: build + claude 验证（非 TG 起盘流程不变；TG 内 MainButton 提交）。提交 `feat(tg-ui): 起盘 /reading 原生(MainButton/暗态输入) [EP-tg-ui-s2]`

**验收：** TG 起盘走 MainButton、暗态可读；非 TG 不变；build 通过。

---

## Task 3（kimi）：命盘 /chart 原生

**Files:** Modify `apps/web/app/chart/page.tsx`
- [ ] Step 1: 「生成完整解读」主操作在 TG 用 `useTgMainButton({text:"为我照见",onClick:generate,visible:isTelegram() && !reading && !streaming})`；页内大按钮 `{!isTelegram() && ...}`。
- [ ] Step 2: Section 标题/卡片依赖 T1 暗态令牌自适配；复核 `ReadingTabs`/`Markdown`/时序卡在暗态可读（如有硬编码色，改令牌）。
- [ ] Step 3: `haptics.success()` 于解读生成完成。
- [ ] Step 4: build + claude 暗态核对。提交 `feat(tg-ui): 命盘 /chart 原生 [EP-tg-ui-s3]`

**验收：** TG 命盘暗态正确、解读生成走 MainButton；非 TG 不变；build 通过。

---

## Task 4（kimi）：运势 /calendar 原生 + 框景图暗态

**Files:** Modify `apps/web/app/calendar/page.tsx`
**Consumes:** `DarkImage`(Task1)、native 组件、令牌。
- [ ] Step 1: 框景水墨配图用 `DarkImageOverlay` 包裹（暗态加深色蒙版融入），或暗态降低其亮度（filter:brightness(.7)）。
- [ ] Step 2: 五维/黄历/上下文卡复核暗态（依赖 T1）；硬编码 `#fff` 文字在 cinnabar 上保留（OK），其余浅色改令牌。
- [ ] Step 3: build + claude 暗态核对（框景图不刺眼、卡片深色）。提交 `feat(tg-ui): 运势 /calendar 原生+框景图暗态 [EP-tg-ui-s4]`

**验收：** 暗态运势整体深色协调、框景图融入；非 TG 不变；build 通过。

---

## Task 5（kimi）：档案 /profiles 原生 cells

**Files:** Modify `apps/web/app/profiles/page.tsx`
**Consumes:** `native.tsx` 的 `Group`/`Cell`、`isTelegram`。
- [ ] Step 1: TG 内档案列表用 `Group`+`Cell`（头像/昵称/日主副文/chevron）替代现有卡片样式；删除按钮保留（cell 内次要动作或长按）；非 TG 保留现样式或同样升级（二选一，保证非 TG 不破——优先：列表样式两端通用，仅确保暗态令牌正确即可，最小改动）。
- [ ] Step 2: build + claude 暗态核对。提交 `feat(tg-ui): 档案 /profiles 原生 cells [EP-tg-ui-s5]`

**验收：** 档案在 TG 暗态原生 cell 观感；非 TG 不变；build 通过。

---

## 上线（claude）
- 全 task accepted + core/llm 测 + web build 全绿 → 合 main → push 部署。
- 真机回归：明/暗各屏（起盘/命盘/灵/运势/档案）原生观感、MainButton/BackButton/haptics；普通 web 零变化。
- 更新 CURRENT.md + memory。

## 编排
owner kimi / reviewer claude（pact `tg-ui-surfaces`）。波次：T1(深色正确性,关键)→T2 起盘→T3 命盘→T4 运势→T5 档案。claude 每波 build+暗态核对(强制 data-tg-theme)+审非 TG 不变+提交+accept；末尾合并部署+真机。
