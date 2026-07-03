# 本命之灵 · 移动端 UI 优化设计

- **Date:** 2026-07-02
- **Status:** Draft（等待 review）
- **代号前缀:** `EP-spirit-ui-*`
- **背景:** 基于 2026-06-28 本命之灵陪伴层设计，针对移动端单手使用场景优化灵对话页与自我画像页。
- **范围:** 仅改 `apps/web` 呈现层，**不改** `core/llm/db` 逻辑、不改命盘冻结数据。

---

## 1. 问题

当前本命之灵页面在移动端的体验问题：

1. **头像太重**：`SpiritPortrait` 默认高度 320px，一屏大半被形象图占掉，聊天内容需要滚动很久才看得到。
2. **输入不跟手**：`textarea + 发送按钮` 随页面滚动，键盘弹起后用户需要手动滚回输入区。
3. **问卷 inline 突兀**：首次进入时 `Questionnaire` 直接插在 `SelfPortrait` 与 `SpiritPanel` 中间，打断对话心流。
4. **自我画像被挤压**：五维进度条、画像解释与聊天混在同一页，信息密度过高，难以聚焦。
5. **缺少快捷引导**：用户进入对话后不知道问什么，全靠手动输入。

## 2. 目标

- 让灵对话页在移动端更像一个「随时可聊的 companion」，而非「命盘页附属面板」。
- 单手拇指能完成：看最新消息 → 点快捷问题 → 输入/发送。
- 自我画像作为独立可分享的页面，与对话形成「看画像 → 聊画像」的闭环。
- **本次不做** 问卷 onboarding 全屏化（用户选择先做 1 和 3）。

## 3. 总体信息架构

```
/spirit
├── 灵对话页（默认）
│   ├── 顶部 header：返回命盘 + 灵名号 + 在线状态
│   ├── 紧凑形象卡：glyph + 名号 + 一句箴言
│   ├── 消息列表（可滚动）
│   ├── 快捷提问 chips
│   └── 底部 sticky 输入栏
└── /spirit/portrait
    ├── 顶部 header：分享按钮
    ├── 形象 + 名号 + 箴言
    ├── 五维画像进度条
    ├── 本命之灵的观察
    └── CTA：和本命之灵聊聊这个
```

## 4. 灵对话页（EP-spirit-ui-01）

### 4.1 布局变更

| 元素 | 现状 | 优化后 |
|---|---|---|
| 形象图 | 320px 全宽大图 | 80×80 圆角卡片 + 名号 + 箴言，整体高度 ≈ 120px |
| 消息区 | `max-h-[420px]` 固定高度 | 占据 header 与输入栏之间全部剩余空间，flex-1 自适应 |
| 输入区 | 页面流式 textarea | **sticky bottom**，始终贴在键盘/安全区上方 |
| 快捷提问 | 无 | 输入栏上方横向滚动的 chips |
| 底部 nav | 无 | 保留全局 bottom nav，当前项高亮「灵」|

### 4.2 交互细节

- **头像点击**：可展开为半屏 modal，显示完整形象图与五行印记说明。
- **快捷 chips**：点击后直接以用户身份发送该问题，spirit 立即回复；支持横向滑动查看更多。
- **输入栏**：
  - 默认 1 行，随内容最多 4 行；
  - Enter 直接发送，Shift+Enter 换行；
  - 空态时发送按钮 disabled。
- **新消息**：自动滚到底部；用户手动向上滚动时暂停自动滚动。

### 4.3 组件改动

- `SpiritPanel.tsx`：
  - 移除内部 `SpiritPortrait` 大图，改为接收 `compact` 模式；
  - 消息区改用 `flex-1` 占满剩余高度；
  - 新增 `QuickPrompts` 组件；
  - 输入区改为 fixed/sticky 底部布局。
- `AppShell.tsx`：spirit 页正常显示 bottom nav（不隐藏）。
- 新增 `QuickPrompts` 组件：`apps/web/components/spirit/QuickPrompts.tsx`。

### 4.4 文案/i18n

新增 key：

```
spirit.quickPrompts: ["事业方向", "感情", "今日运势", "自我画像"]
spirit.online: "在线"
spirit.inputPlaceholder: "输入你想聊的…"
```

## 5. 自我画像页（EP-spirit-ui-02）

### 5.1 从 inline 卡片拆为独立页

- 路由：`/spirit/portrait`。
- 入口：
  - 灵对话页快捷 chip「自我画像」；
  - 命盘页 `/chart` 保留现有 `SelfPortrait` 卡片（不删除，作为发现入口）；
  - 分享：页面右上角「分享」按钮生成当前画像截图/链接。

### 5.2 页面结构

1. **Header**：标题「自我画像」+ 右上角「分享」按钮。
2. **形象区**：大号 glyph（96px）+ 名号 + 箴言，居中。
3. **五维画像**：
   - 标签 + 进度条 + 数值；
   - 每个维度颜色对应五行（沉稳-土黄、行动-火红、内省-水蓝、联结-木绿、开阔-金棕）。
4. **本命之灵的观察**：
   - 把最高/最低维度解释成人话；
   - 文案由 LLM 根据 `deriveSelfPortrait` 结果生成，可缓存。
5. **CTA**：「和本命之灵聊聊这个」→ 回到 `/spirit` 并自动发送「我想聊聊我的自我画像」。

### 5.3 组件改动

- `SelfPortrait.tsx`：
  - 拆出可复用的 `PortraitDimensions` 子组件；
  - 新增 `fullPage` prop：为 true 时显示观察文本与 CTA，为 false 时保持当前卡片形态。
- 新增页面：`apps/web/app/spirit/portrait/page.tsx`。

## 6. 不做的范围

- 不改 `deriveSpirit` / `deriveSelfPortrait` / LLM 提示词。
- 不改 `spirit_messages` 表结构或 RLS。
- 不做 3D/TTS/形象图真渲染（继续用现有 `portrait-<element>.jpg` 占位，优化的是布局而非资源）。
- 本次不做问卷 onboarding 全屏化（保留现有 inline 问卷，后续可选）。

## 7. 验收标准

### EP-spirit-ui-01

- [ ] 移动端视口下， Spirit Chat 形象卡高度 ≤ 140px。
- [ ] 输入栏在键盘弹起时仍可见且可点击发送。
- [ ] 快捷 chips 横向滚动，点击后自动发送并触发 spirit 回复。
- [ ] 消息区滚动到底部行为正常，手动上滑时不被强制拉回。
- [ ] 6 路由 200 回归通过（/spirit 及 /spirit/portrait）。

### EP-spirit-ui-02

- [ ] `/spirit/portrait` 可独立访问，展示完整自我画像。
- [ ] 五维进度条颜色与五行一致，数值正确。
- [ ] 「和本命之灵聊聊这个」跳转回 `/spirit` 并预填消息。
- [ ] 分享按钮存在（可先占位，后续接分享能力）。

## 8. 风险

- **底部 nav 与 TG Mini App 的冲突**：在 Telegram WebView 中，全局 bottom nav 可能被 TG 原生底栏挤压。需用 `env(safe-area-inset-bottom)` 与 `isTelegram()` 判断，TG 内保持现有隐藏 nav 逻辑。
- **键盘弹起布局**：iOS Safari 的 `position: fixed` 输入栏在键盘弹起时行为特殊，需用 `visual viewport` 或 `dvh` 配合测试。
- **图片占位**：`portrait-<element>.jpg` 若加载失败，现有 fallback 为 `SpiritSigil`，优化后 fallback 保持。

## 9. 文件清单

| 文件 | 动作 |
|---|---|
| `apps/web/app/spirit/page.tsx` | 修改：引入 compact hero、路由到 portrait |
| `apps/web/app/spirit/portrait/page.tsx` | 新增：独立自我画像页 |
| `apps/web/app/chart/SpiritPanel.tsx` | 修改：compact 模式、sticky 输入、快捷 chips |
| `apps/web/app/chart/SelfPortrait.tsx` | 修改：支持 fullPage prop，拆出 PortraitDimensions |
| `apps/web/components/spirit/QuickPrompts.tsx` | 新增 |
| `apps/web/components/AppShell.tsx` | 修改：spirit 页显示 bottom nav |
| `lib/i18n/messages/zh.ts` / `en.ts` | 修改：新增 i18n key |
