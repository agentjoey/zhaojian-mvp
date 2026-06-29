# 照见 Telegram 原生 UI · 子项目 1：原生地基 — Design Spec

- **Date:** 2026-06-29
- **Status:** Draft（设计确认中，待 writing-plans）
- **代号:** `EP-tg-ui` · 子项目 1（地基）
- **目标:** 让照见 Mini App 在 Telegram 内呈现「类原生」体验：跟随 TG 明/暗主题（深色水墨已选定为主推视觉）、采用 TG 原生 chrome（Back/Main button、haptics、viewport、header/bg 色）、提供原生组件套件。地基落地后全站立即获得主题跟随 + 原生交互；各界面后续逐个原生重排（子项目 2~6）。
- **大前提:** **非 Telegram（普通 web）行为零变化**——所有改动包在 `isTelegram()` 分支或仅在 TG 环境注入的令牌/组件里。现有 web 冻结不受影响。

---

## 1. 主题桥（theme bridge）
- 新 `apps/web/lib/tg/theme.ts`（client）：
  - `applyTgTheme()`：读 `window.Telegram.WebApp.themeParams`（`bg_color/secondary_bg_color/text_color/hint_color/link_color/button_color/button_text_color/header_bg_color` 等）+ `colorScheme`（`light|dark`）。
  - 在 `<html>` 上设 `data-tg-theme="light|dark"` 并写入桥接 CSS 变量（把 TG 值喂给一组 `--tg-*`），同时**重映射照见令牌**（`--color-paper/bg/ink/ink-2/muted/line` 等）到明/暗两套值。
  - 监听 `WebApp.onEvent("themeChanged", applyTgTheme)` 实时更新。
- **令牌策略**（CSS，`globals.css` 增 TG 作用域块，`html[data-tg-theme]` 下生效，不影响非 TG）：
  - **亮（素白）**：沿用现有素白水墨值。
  - **暗（深色水墨，主推）**：`--bg:#100e0b` `--bg2:#1a1712` `--ink:#ece6da` `--ink2:#c4bcae` `--muted:#8a8276` `--line:#2a2620`；朱砂强调暗态用 `#d4564a`（提亮以保对比）。
  - 朱砂为照见识别色，明暗两态均保留为强调（不被 TG `button_color` 完全替换；MainButton 用 TG 原生按钮色，页内强调用朱砂）。
- 已交付的预览 `tg-native-preview.html` 即此目标视觉的事实基准。

## 2. TG 原生 chrome
- 新 `apps/web/components/tg/TgUiProvider.tsx`（client，包裹 AppShell/children）：仅 `isTelegram()` 时——`WebApp.ready()`+`expand()`；`setHeaderColor`/`setBackgroundColor`(跟随主题 bg)；`enableClosingConfirmation()`；首屏调 `applyTgTheme()` + 订阅 themeChanged。
- `apps/web/lib/tg/ui.ts` hooks/工具：
  - `useTgBackButton()`：非根路由显示 `BackButton` 并接 `router.back()`；根路由隐藏。（根=`/` 或 Mini App 入口页。）
  - `useTgMainButton({ text, onClick, enabled, visible })`：每页主操作映射到原生 `MainButton`（起盘=「为我起盘」、灵对话=「发送」、问卷=「完成」）；非 TG 回退为页内全宽按钮（保持现有）。
  - `haptics`：`impact('light'|'medium')` / `notification('success'|'error')`，包 `WebApp.HapticFeedback`，非 TG 空转。
- **导航**：TG 内隐藏 web 底部导航（`AppShell` 的 nav 在 `isTelegram()` 时不渲染）；页间流转靠原生组件（cell 链接）+ `BackButton`。（原生 tab bar 留后续可选。）

## 3. 原生组件套件
- 新 `apps/web/components/tg/native.tsx`：`Section`（带可选标题）、`Cell`（图标+主/副文+chevron，可点）、`Group`（圆角分组+分隔线）、`Bubble`（灵/用户气泡）。全部用主题令牌着色，明暗自适配。预览里的样式为准。
- 这些组件**仅用于 Mini App 界面重排**（子项目 2~6）；地基阶段先建好 + 在本命之灵面板示范接入一处。

## 4. 深色位图处理
- 现有装饰位图（运势框景水墨图、首页氛围大图）为浅底烤死，暗态会突兀。
- 地基提供 `dark` 处理工具/类：暗态对这些装饰位图加**深色蒙版**（`mix-blend`/半透明黑罩）或降透明；命盘 SVG 用 CSS 变量自动适配；形象图本就深色，免处理。
- 各图的最终取舍（蒙版 vs 隐藏框景 vs 换深色版）在「运势/首页」界面重排时定；地基只给工具 + 默认蒙版，保证暗态不破。

## 5. 接入与验收
- `TgUiProvider` 接入根 layout（包裹 AppShell）；`applyTgTheme` 首屏生效；非 TG 完全旁路。
- 验收：① TG 内明/暗跟随系统、`themeChanged` 实时切；② BackButton/MainButton/haptics 生效；③ 底部 web 导航在 TG 隐藏；④ 本命之灵面板示范用原生组件 + 深色水墨观感（对齐预览）；⑤ 普通 web（非 TG）视觉与交互零变化；⑥ `pnpm --filter @eamvp/web build` 通过。

## 6. 风险
- **主题闪烁**：首屏在 TG 主题应用前可能闪一下默认色——`TgUiProvider` 尽早（layout 顶层）应用 + 可选首屏隐藏到 ready。
- **非 TG 回退**：所有 hooks/组件在非 TG 必须安全空转（无 `window.Telegram`）。
- **范围蔓延**：地基**不**重排各业务界面（那是子项目 2~6）；只建主题/chrome/组件/工具 + 示范一处。

## 7. 后续子项目（各自 spec/plan）
2 起盘向导 · 3 命盘 · 4 灵对话 · 5 运势 · 6 档案 —— 用本地基的组件/主题逐个原生重排。
