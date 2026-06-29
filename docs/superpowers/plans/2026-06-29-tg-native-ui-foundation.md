# 照见 TG 原生 UI · 地基 Implementation Plan

> 执行者 `kimi`，reviewer `claude`。kimi 只改列出文件、不 commit、密钥只读 env。本地验证由 claude（启 dev 前 `set -a; . ./apps/web/.env.local; set +a`）。

**Goal:** 让照见 Mini App 在 Telegram 内跟随明/暗主题（深色水墨主推）+ 原生 chrome（Back/Main button、haptics、viewport）+ 原生组件套件；非 TG web 零变化。

**Architecture:** 运行时检测 `isTelegram()`；TG 内由 `TgUiProvider` 应用主题与 chrome，CSS 令牌按 `html[data-tg-theme]` 重映射；提供 hooks(back/main/haptics) 与原生组件，本命之灵面板示范接入。

**Tech Stack:** Next 16 client components · Telegram WebApp JS API（已在 layout 注入 telegram-web-app.js）· CSS 变量 · Tailwind 4。

## Global Constraints
- **非 Telegram（web）行为零变化**：所有 TG 逻辑包在 `isTelegram()` 或 `html[data-tg-theme]` 作用域；hooks/组件在非 TG 安全空转。
- 深色水墨令牌值（暗）：`--color-paper/bg→#100e0b`、`--color-bg2→#1a1712`、`--color-ink→#ece6da`、`--color-ink-2→#c4bcae`、`--color-muted→#8a8276`、`--color-line→#2a2620`、暗态朱砂 `#d4564a`。亮态沿用现值。视觉基准 = 已交付 `tg-native-preview.html`。
- 全程简体中文 UI。
- 已有：`apps/web/lib/tg/client.ts`(isTelegram/tgReadyExpand)、layout 注入 telegram-web-app.js、`apps/web/components/AppShell.tsx`(底部导航)。
- 不重排各业务界面（那是后续子项目）；本地基只建基础设施 + 示范一处。
- 验收每任务 `pnpm --filter @eamvp/web build` 通过。

## File Structure
- Create `apps/web/lib/tg/theme.ts` — `applyTgTheme()`/`watchTgTheme()`：读 themeParams/colorScheme → 设 `html[data-tg-theme]` + 桥接变量。
- Modify `apps/web/app/globals.css` — `html[data-tg-theme="light"|"dark"]` 作用域令牌覆盖（深色水墨）。
- Create `apps/web/lib/tg/ui.ts` — `useTgBackButton()`/`useTgMainButton()`/`haptics`。
- Create `apps/web/components/tg/TgUiProvider.tsx` — TG 内 ready/expand/setColors/closingConfirmation + 应用主题；非 TG 直接渲染 children。
- Modify `apps/web/app/layout.tsx` — 用 `TgUiProvider` 包裹 `AppShell`。
- Modify `apps/web/components/AppShell.tsx` — `isTelegram()` 时不渲染底部/侧边导航。
- Create `apps/web/components/tg/native.tsx` — `Section`/`Group`/`Cell`/`Bubble` 原生组件。
- Modify `apps/web/app/chart/SpiritPanel.tsx` — 示范：发送按钮用 `useTgMainButton`（TG）/页内按钮（web）；haptics。

**Pact** feature `tg-ui-foundation`。

---

## Task 1（kimi）：主题桥 + 深色水墨令牌

**Files:** Create `apps/web/lib/tg/theme.ts`；Modify `apps/web/app/globals.css`

**Produces:**
```ts
export function applyTgTheme(): void;   // 读 TG 主题→设 html[data-tg-theme] + 变量
export function watchTgTheme(): () => void; // 订阅 themeChanged，返回取消函数；首帧先 apply 一次
```

- [ ] Step 1: `theme.ts`
```ts
"use client";
type WA = { colorScheme?: "light"|"dark"; themeParams?: Record<string,string>; onEvent?: (e:string,cb:()=>void)=>void; offEvent?: (e:string,cb:()=>void)=>void };
function wa(): WA | undefined { return (typeof window!=="undefined" ? (window as any).Telegram?.WebApp : undefined); }
export function applyTgTheme(): void {
  const w = wa(); if (!w) return;
  const scheme = w.colorScheme === "dark" ? "dark" : "light";
  const root = document.documentElement;
  root.setAttribute("data-tg-theme", scheme);
  const p = w.themeParams || {};
  // 把 TG 原生色暴露为 --tg-*（供 header/链接等对齐），令牌主色仍由 globals.css 的 data-tg-theme 块决定
  for (const [k,v] of Object.entries(p)) root.style.setProperty(`--tg-${k.replace(/_/g,"-")}`, String(v));
}
export function watchTgTheme(): () => void {
  const w = wa(); if (!w) return () => {};
  applyTgTheme();
  const cb = () => applyTgTheme();
  w.onEvent?.("themeChanged", cb);
  return () => w.offEvent?.("themeChanged", cb);
}
```
- [ ] Step 2: `globals.css` 末尾追加（作用域令牌；只在 TG 注入 data-tg-theme 时生效，非 TG 无该属性→零影响）
```css
/* ===== Telegram Mini App 主题（跟随 TG colorScheme）===== */
html[data-tg-theme="dark"]{
  --color-paper:#100e0b; --color-bg2:#1a1712;
  --color-ink:#ece6da; --color-ink-2:#c4bcae; --color-muted:#8a8276;
  --color-line:#2a2620; --color-cinnabar:#d4564a;
  --color-rail:#161310;
}
html[data-tg-theme="dark"] body{ background:var(--color-paper); color:var(--color-ink); }
html[data-tg-theme="light"]{ /* 亮态沿用现有素白默认，无需覆盖 */ }
```
> 注：用现有令牌名（确认 `globals.css` 实际变量名，按现有命名覆盖；若是 `--color-bg` 而非 `--color-paper`，以实际为准——kimi 先 grep 现有 `:root` 令牌名再对齐覆盖）。
- [ ] Step 3: build 通过。提交（claude）`feat(tg-ui): 主题桥 + 深色水墨令牌 [EP-tg-ui-1]`

**验收：** TG 内 colorScheme=dark → html[data-tg-theme=dark] + 令牌切深色水墨；themeChanged 实时；非 TG 无 data-tg-theme、零变化。

---

## Task 2（kimi）：chrome hooks（back/main/haptics）

**Files:** Create `apps/web/lib/tg/ui.ts`
**Consumes:** `isTelegram`(client.ts)。
**Produces:**
```ts
export function useTgBackButton(opts?: { rootPaths?: string[] }): void; // 非根路由显示 BackButton→router.back()
export function useTgMainButton(o: { text: string; onClick: () => void; enabled?: boolean; visible?: boolean }): void;
export const haptics: { light(): void; medium(): void; success(): void; error(): void };
```
- [ ] Step 1: 实现（用 `window.Telegram.WebApp.BackButton/MainButton/HapticFeedback`；React `useEffect` 注册+清理；非 TG 全空转）。`useTgBackButton`：用 `usePathname`+`useRouter`，路径不在 rootPaths(默认 `["/","/spirit"]` 视入口而定，取 `["/"]`) 时 `BackButton.show()`+`onClick(()=>router.back())`，卸载 `hide()`+`offClick`。`useTgMainButton`：`MainButton.setText`+`show`+`onClick`，`enabled` 控 `enable/disable`，卸载 `hide()`+`offClick`；非 TG 空转。`haptics`：包 `HapticFeedback.impactOccurred('light'|'medium')` / `notificationOccurred('success'|'error')`，try/catch 空转。
- [ ] Step 2: build 通过。提交 `feat(tg-ui): back/main button + haptics hooks [EP-tg-ui-2]`

**验收：** TG 内 hooks 控制原生按钮；非 TG 空转不报错；TS 通过。

---

## Task 3（kimi）：TgUiProvider + layout 接入 + TG 隐藏 web 导航

**Files:** Create `apps/web/components/tg/TgUiProvider.tsx`；Modify `apps/web/app/layout.tsx`、`apps/web/components/AppShell.tsx`
**Consumes:** `applyTgTheme`/`watchTgTheme`(theme.ts)、`isTelegram`(client.ts)。
- [ ] Step 1: `TgUiProvider.tsx`（"use client"）：`useEffect`：`if(!isTelegram()) return;` → `const w=window.Telegram.WebApp; w.ready(); w.expand?.(); const off=watchTgTheme(); w.setHeaderColor?.("secondary_bg_color"); w.enableClosingConfirmation?.(); return off;`。渲染 `{children}`（不包额外 DOM）。
- [ ] Step 2: `layout.tsx`：`import { TgUiProvider }`；把 `<AppShell>{children}</AppShell>` 包成 `<TgUiProvider><AppShell>{children}</AppShell></TgUiProvider>`。（layout 是 server component；TgUiProvider 是 client，可直接用。）
- [ ] Step 3: `AppShell.tsx`：`import { isTelegram } from "@/lib/tg/client";` 顶部加 `const tg = typeof window!=="undefined" && isTelegram();`（或用 useState+useEffect 避免 SSR 不一致：`const [tg,setTg]=useState(false); useEffect(()=>setTg(isTelegram()),[]);`）。`tg` 为真时**不渲染** `<nav>`（桌面侧栏 + 移动底栏都不渲染），且容器去掉给导航留的 padding（`md:pl-[82px]`/`pb-24`）。非 TG 原样。
- [ ] Step 4: build + claude 本地（TG 模拟）验证。提交 `feat(tg-ui): TgUiProvider + 隐藏 web 导航(TG) [EP-tg-ui-3]`

**验收：** TG 内主题应用 + 无 web 导航 + viewport 展开；非 TG 导航与布局零变化；build 通过。

---

## Task 4（kimi）：原生组件套件 + 本命之灵面板示范

**Files:** Create `apps/web/components/tg/native.tsx`；Modify `apps/web/app/chart/SpiritPanel.tsx`
**Produces:** `Section({title,children})`、`Group({children})`、`Cell({icon,title,subtitle,accent,onClick})`、`Bubble({role:"spirit"|"user",children})`（样式以 `tg-native-preview.html` 为准，用令牌着色，明暗自适配）。
- [ ] Step 1: `native.tsx`（"use client"）按预览实现四组件（圆角分组/分隔线/chevron/气泡）。
- [ ] Step 2: `SpiritPanel.tsx` 示范：`isTelegram()` 时——发送主操作用 `useTgMainButton({text:"发送", onClick:submit, enabled:!streaming && !!input.trim()})` 替代页内发送按钮（web 保留页内按钮）；发送/收到回复时 `haptics.light()`。消息气泡可改用 `Bubble`（或保留现样式，二选一，保证明暗 OK）。**非 TG 行为不变。**
- [ ] Step 3: build + claude 本地验证（对齐预览观感）。提交 `feat(tg-ui): 原生组件套件 + 灵面板示范接入 [EP-tg-ui-4]`

**验收：** 组件明暗自适配；TG 内灵面板发送走 MainButton + haptics；非 TG 不变；build 通过。

---

## 上线（claude）
- 全 task accepted + build 绿 → 合 main → push 部署（无新增 env）。
- 真机回归：TG 内明/暗跟随、Back/Main button、无 web 导航、灵面板观感；普通 web 浏览器视觉/交互零变化。
- 更新 CURRENT.md + memory [[feat-telegram-frontend]]。

## 编排
owner kimi / reviewer claude（pact `tg-ui-foundation`）。波次：T1(主题)→T2(hooks)→T3(provider+导航)→T4(组件+示范)。claude build/真机模拟/提交/accept/合并/部署。后续子项目 2~6（各界面原生重排）各自 spec/plan。
