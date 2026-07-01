# 照见 · 中英双语 Implementation Plan（地基 + 全站翻译）

> 执行者 `kimi`，reviewer `claude`。kimi 只改列出文件、不 commit。spec: `docs/superpowers/specs/2026-07-01-i18n-bilingual-design.md`。**专名策略：保留中文 + 英文注释**（如 `天府(Tian Fu)`、`日主(Day Master)`）。

**Goal:** 全站中英双语——locale 机制(自动检测+可切) + LLM 按 locale 输出 + 所有 UI 面字符串抽取翻译；未翻译面回退中文不崩。

**Architecture:** 轻量自建字典：`useLocale()`/`useT()` + `messages/{zh,en}` 命名空间字典；`detectLocale`(持久化>TG language_code>navigator>zh)；Provider 挂根 layout。组件把硬编码中文改 `t("ns.key")`。

**Tech Stack:** React context · cookie/localStorage(`zj_locale`) · 复用 `packages/llm` ReadingLanguage。

## Global Constraints
- 未翻译 key 回退 zh 原文（不崩、不空白）。默认 locale = zh；英文为可选。
- 专名保留中文 + 英文注释（en 字典里写 `天府(Tian Fu)` 形式）。
- LLM 正文由模型按 locale 生成，不进 UI 字典。
- 每任务 `pnpm --filter @eamvp/web build` 通过；地基后每面翻译不破坏中文。

## File Structure
- Create `apps/web/lib/i18n/locale.ts`、`I18nProvider.tsx`、`messages/zh.ts`、`messages/en.ts`、`switch.tsx`(切换器)。
- Modify `apps/web/app/layout.tsx`(挂 Provider)、`apps/web/app/account/page.tsx`(切换器)。
- LLM locale：Modify `apps/web/app/api/spirit/chat/route.ts`、`api/tg/spirit`、`api/tg/daily`、解读生成处 + 对应 client 调用。
- 逐面翻译：`page.tsx`(首页)、`reading/*`、`chart/*`、`calendar/*`、`spirit/*`+`chart/{SpiritPanel,Questionnaire,SelfPortrait}`、`profiles/*`、`components/*`(AppShell/Paywall/native 等)。

**Pact** feature `i18n`。

---

## Task 1（kimi）：i18n 地基（locale + Provider + t + 切换器）

**Files:** Create `apps/web/lib/i18n/locale.ts`、`I18nProvider.tsx`、`messages/zh.ts`、`messages/en.ts`、`switch.tsx`；Modify `apps/web/app/layout.tsx`
**Produces:**
```ts
export type Locale = "zh" | "en";
export function detectLocale(): Locale;           // 客户端：cookie zj_locale > navigator.language(zh*→zh 否则 en) ; SSR 返回 "zh"
export const LOCALE_COOKIE = "zj_locale";
// I18nProvider: <I18nProvider>{children}</I18nProvider>
export function useLocale(): { locale: Locale; setLocale: (l: Locale) => void };
export function useT(): (key: string, vars?: Record<string,string|number>) => string;
```
- [ ] Step 1: `locale.ts`（detectLocale：`document.cookie` 找 `zj_locale`；无则 `navigator.language.startsWith("zh")?"zh":"en"`；SSR guard→"zh"）。
- [ ] Step 2: `messages/zh.ts` + `en.ts`：嵌套对象按命名空间 `{ common:{...}, nav:{...}, account:{...} }`；先放**首批 keys**（common/nav/account/paywall——见 Task 3 会用），zh 为原文、en 为译文。结构一致。
- [ ] Step 3: `I18nProvider.tsx`（"use client"）：context 存 `locale`(init=detectLocale())；`setLocale` 写 cookie(`zj_locale`,1yr,path/,SameSite Lax)+localStorage+setState；`useT` 返回 `t(key,vars)`：按 `.` 路径从当前 locale 字典取，缺则从 zh 取，再缺返回 key；`vars` 做 `{name}` 插值。
- [ ] Step 4: `switch.tsx`：`<LocaleSwitch/>` 两枚 pill 中文/English → setLocale。
- [ ] Step 5: `layout.tsx`：`<I18nProvider>` 包在 `TgUiProvider` 内层包住 AppShell/children。（可选：`<html lang>` 由 provider 客户端更新。）
- [ ] Step 6: build。提交 `feat(i18n): locale 机制+Provider+useT+切换器 [EP-i18n-1]`

**验收：** `useLocale/useT` 可用；切换持久化跨刷新；缺 key 回退 zh；build 通过。

---

## Task 2（kimi）：LLM 输出按 locale

**Files:** Modify `apps/web/app/api/spirit/chat/route.ts`、`apps/web/app/api/tg/spirit/route.ts`、`apps/web/app/api/tg/daily/route.ts`、解读生成接口 + `apps/web/lib/tg/client.ts`/相关 client 调用
- [ ] Step 1: 定义 `localeToReadingLanguage(locale)`（zh→"zh", en→"en"）在 `lib/i18n/locale.ts`。
- [ ] Step 2: 客户端调用 LLM 接口时带 `locale`（body 或 header `x-zj-locale`）；服务端读之，兜底读 `zj_locale` cookie / TG `language_code`，传入 llm 的 language 参数（spirit/daily/reading 的 prompt 构建）。
- [ ] Step 3: build + claude 实跑（locale=en 时灵/解读输出英文一次）。提交 `feat(i18n): LLM 输出按 locale [EP-i18n-2]`

**验收：** en locale → LLM 解读/灵/每日输出英文；zh 不变；build 通过。

---

## Task 3-8（kimi，逐面）：UI 字符串抽取 + 翻译（全站）

> 每面一个 task：把该面硬编码中文抽到 `messages/{zh,en}` 对应命名空间，组件改 `useT()` + `t("ns.key")`。zh=原文、en=译文（专名保留中文+英文注释）。未涉及面回退中文。每面 build 通过 + 中/英切换核对。

- [ ] **Task 3 全局/导航/account/paywall/组件**：`components/AppShell.tsx`、`components/Paywall.tsx`、`components/tg/native.tsx`(若有文案)、`app/account/page.tsx`、`app/auth/callback/page.tsx`。命名空间 `common/nav/account/paywall`。提交 `[EP-i18n-3]`
- [ ] **Task 4 首页 + 起盘**：`app/page.tsx`、`app/reading/*`。ns `home/reading`。提交 `[EP-i18n-4]`
- [ ] **Task 5 命盘壳 + 解读 UI**：`app/chart/page.tsx`、`ReadingTabs`、`SelfPortrait`、图谱组件的标签(八字/紫微/西方 + 专名保留中文+注释)。ns `chart`。提交 `[EP-i18n-5]`
- [ ] **Task 6 运势**：`app/calendar/*`(AskToday 等)。ns `calendar`。提交 `[EP-i18n-6]`
- [ ] **Task 7 本命之灵 + 问卷 + 画像**：`app/spirit/page.tsx`、`chart/SpiritPanel.tsx`、`Questionnaire.tsx`、`SelfPortrait`。ns `spirit`。提交 `[EP-i18n-7]`
- [ ] **Task 8 档案**：`app/profiles/page.tsx`。ns `profiles`。提交 `[EP-i18n-8]`

每 Task 验收：该面中/英切换文案正确、专名保留中文+英文注释、未译面回退中文、build 通过。

## 上线（claude）
全 task accepted + core/llm 测 + build 全绿 → 合 main → 手动触发部署。真机/浏览器：切 English 全站英文(专名带注释)、LLM 出英文；切中文如常；TG language_code 自动。更新 CURRENT.md + memory。

## 编排
owner kimi / reviewer claude（pact `i18n`）。波次：T1 地基 → T2 LLM locale → T3-8 逐面翻译。claude 每波 build+切换核对+审+提交+accept。字典 keys 命名空间一致(zh/en 对齐)。
