# 照见 · 中英双语（i18n）— Design Spec

- **Date:** 2026-07-01
- **Status:** Draft（决策已定，待 review）
- **代号:** `EP-i18n`
- **决策（已定）:** 中英双语·**自动检测 + 可手动切换**；UI 全 i18n；LLM 输出按所选语言（`ReadingLanguage` 已支持 en/zh）。

## 现状
- **LLM 层已双语**：`packages/llm` `ReadingLanguage="en"|"zh"`、`buildSystemPrompt(language)`、`parseSections(language)`；灵/每日等 prompt 亦 language-aware。→ 输出语言只差「把用户 locale 传进去」。
- **UI 无 i18n**：全站中文硬编码（`apps/web` 几十个组件）。→ 需 locale 机制 + 中英字典 + 逐面抽字符串。

## 架构：轻量自建字典（不引 next-intl，避免路由改造）
### 1. Locale 机制（地基）
- `apps/web/lib/i18n/locale.ts`：`type Locale="zh"|"en"`；`detectLocale()`（优先级：用户持久化选择 `localStorage/cookie` > TG `language_code`(Mini App/登录) > `navigator.language` > 默认 zh）。
- `apps/web/lib/i18n/I18nProvider.tsx`（client context）：`useLocale()` → `{ locale, setLocale }`；`setLocale` 持久化(cookie `zj_locale` 非 httpOnly + localStorage) 并触发重渲染。挂在根 layout（TgUiProvider 内层）。
- `apps/web/lib/i18n/t.ts`：`useT()` → `t(key, vars?)` 从 `messages/{zh,en}.ts` 取；缺 key 回退 zh 原文 + dev warn。字典按命名空间分文件（`messages/zh/*.ts`）。
- **语言切换器**：`/account` + （可选）导航；`setLocale`。

### 2. LLM 输出按 locale
- 各解读/灵/每日接口把 `locale` 传入 llm（映射 Locale→ReadingLanguage）。前端调用时带当前 locale；服务端也可读 `zj_locale` cookie / TG language_code 兜底。
- TG 端：用户 `language_code` 自动决定（海外华裔/西方用户），可被手动切换覆盖。

### 3. UI 字符串抽取（大工程，分批增量）
- 把硬编码中文抽到 `messages/zh` 并译 `messages/en`，组件改用 `t("ns.key")`。
- **按面分批**（每批一个 spec 内的 task 或后续独立小 plan）：① 全局/导航/account/paywall → ② 首页/起盘 → ③ 命盘/解读壳(非 LLM 正文) → ④ 运势 → ⑤ 灵/问卷/画像壳 → ⑥ 档案。
- **不翻译**：LLM 生成正文（由 LLM 按 locale 直接产出）；命理专名（八字/紫微星曜等）保留中文或加注（按面定）。

## 落地顺序（本 spec = 地基 + 首批面）
1. **地基**：locale 机制 + Provider + t() + 切换器 + LLM locale 接线（无字符串翻译，先让「能切、能出英文 LLM」跑通）。
2. **首批 UI 翻译**：全局/导航/account/paywall/首页（高频面）。
—— 其余面（起盘/命盘/运势/灵/档案）作为后续增量批次（各自小 plan），逐步补齐；未翻译面暂回退中文，不崩。

## 测试
- `detectLocale` 优先级三态；`setLocale` 持久化+跨刷新；`t()` 缺 key 回退。
- LLM：locale=en → 解读/灵输出英文（实跑一次）。
- 已翻译面中/英切换正确；未翻译面回退中文可读。

## 风险
- **工作量**：全站字符串抽取巨大——**分批**，地基 + 首批先上，其余增量；每批不阻塞发布。
- **混排**：未翻译面在 en 下显示中文——可接受的中间态（回退），逐批消除。
- **命理专名**：星曜/四柱等中文专名在英文 UI 下的处理（保留+注释 vs 意译）——按面决定，默认保留中文专名 + 英文说明。
- **SSR/闪烁**：locale 首屏检测前避免语言闪烁——cookie `zj_locale` 服务端可读，SSR 首屏即用正确 locale。

## 不在范围（后续增量）
- 起盘/命盘/运势/灵/档案的完整字符串翻译（本 spec 后逐批）；多语言（仅中/英）；LLM 正文的术语本地化深化。
