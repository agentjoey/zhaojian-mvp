# 本命之灵 · 移动端 UI 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把本命之灵对话页改造成移动端 companion 聊天体验，并把自我画像拆成独立可分享的 `/spirit/portrait` 页面。

**Architecture:** 纯前端呈现层改造。`SpiritPanel` 增加 compact 模式（压缩形象卡、sticky 输入栏、快捷 chips）；`SelfPortrait` 拆出可复用的 `PortraitDimensions`，新增 `fullPage` 模式；新增 `/spirit/portrait` 页面；`/spirit` 主页面只保留紧凑对话入口。

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Tailwind CSS · shadcn/ui-like 原子组件 · `@eamvp/core` 派生函数 · vitest + React Testing Library。

## Global Constraints

- `Node.js >= 24` / `pnpm 10.33.0`（由 `package.json` 与 `pnpm-workspace.yaml` 锁定）。
- 不改 `core/`、`llm/`、`db/` 逻辑；不改 Supabase schema 或 RLS。
- 不改 `/chart` 页现有 `SelfPortrait` 卡片行为（仅新增 `fullPage` prop）。
- 保留 Telegram Mini App 兼容：`isTelegram()` 时隐藏全局 bottom nav、继续使用 TG MainButton。
- 颜色/字号严格使用现有 CSS 变量与 Tailwind token，不引入新设计系统。
- 所有新增文案必须进 `lib/i18n/messages/zh.ts` 与 `en.ts`。

---

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `apps/web/lib/i18n/messages/zh.ts` | 修改 | 新增「快捷提问」「在线」「聊聊画像」等中文文案 |
| `apps/web/lib/i18n/messages/en.ts` | 修改 | 对应英文文案 |
| `apps/web/components/spirit/QuickPrompts.tsx` | 新建 | 横向可滚动快捷提问 chips |
| `apps/web/app/chart/SpiritPanel.tsx` | 修改 | compact 形象卡、flex-1 消息区、sticky 输入栏、接入 QuickPrompts |
| `apps/web/app/chart/SelfPortrait.tsx` | 修改 | 拆出 `PortraitDimensions` 子组件，支持 `fullPage` 模式 |
| `apps/web/app/spirit/page.tsx` | 修改 | 紧凑 header、隐藏 inline SelfPortrait/Questionnaire、只留 SpiritPanel |
| `apps/web/app/spirit/portrait/page.tsx` | 新建 | 独立自我画像页，含分享按钮与 CTA |
| `apps/web/components/AppShell.tsx` | 修改（可能无需改动） | spirit 页已在 NAV 中，确认 `/spirit/portrait` active 状态正确 |
| `apps/web/app/chart/__tests__/SelfPortrait.test.tsx` | 修改/新建 | `fullPage` 模式渲染测试 |
| `apps/web/components/spirit/__tests__/QuickPrompts.test.tsx` | 新建 | 点击与滚动测试 |

---

### Task 1: i18n 文案

**Files:**
- Modify: `apps/web/lib/i18n/messages/zh.ts`
- Modify: `apps/web/lib/i18n/messages/en.ts`
- Test: `pnpm typecheck`

**Interfaces:**
- Produces: 新增 `Messages["spirit"]` key，供 `useT()` 消费。

- [ ] **Step 1: 在 `zh.ts` 的 `spirit` 对象中追加 key**

在 `spirit: { ... }` 内（`inputPlaceholder` 之后）插入：

```ts
    quickPrompts: ["事业方向", "感情", "今日运势", "自我画像"],
    online: "在线",
    portraitPageTitle: "自我画像",
    share: "分享",
    talkAboutPortrait: "和本命之灵聊聊这个",
    portraitIntro: "由命盘结构与自我自陈合成的内在侧写",
    portraitNoteTitle: "本命之灵的观察",
    viewPortrait: "查看自我画像 →",
```

- [ ] **Step 2: 在 `en.ts` 的 `spirit` 对象中追加对应英文**

```ts
    quickPrompts: ["Career", "Relationship", "Today's Fortune", "Self-Portrait"],
    online: "Online",
    portraitPageTitle: "Self-Portrait",
    share: "Share",
    talkAboutPortrait: "Talk to your Natal Spirit about this",
    portraitIntro: "An inner profile synthesized from chart structure and self-report",
    portraitNoteTitle: "Your Natal Spirit's observation",
    viewPortrait: "View Self-Portrait →",
```

- [ ] **Step 3: 运行 typecheck 确认 i18n 类型正确**

Run: `pnpm typecheck`
Expected: 0 errors。

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/i18n/messages/zh.ts apps/web/lib/i18n/messages/en.ts
git commit -m "i18n: add spirit mobile UI copy"
```

---

### Task 2: QuickPrompts 组件

**Files:**
- Create: `apps/web/components/spirit/QuickPrompts.tsx`
- Create: `apps/web/components/spirit/__tests__/QuickPrompts.test.tsx`

**Interfaces:**
- Consumes: `useT()` 读取 `spirit.quickPrompts`。
- Produces: `onSelect(prompt: string): void`。

- [ ] **Step 1: 写 failing test**

Create `apps/web/components/spirit/__tests__/QuickPrompts.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickPrompts } from "../QuickPrompts";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="zh">{children}</I18nProvider>;
}

describe("QuickPrompts", () => {
  it("renders prompts and calls onSelect when clicked", () => {
    const onSelect = vi.fn();
    render(<QuickPrompts onSelect={onSelect} />, { wrapper: Wrapper });
    const first = screen.getByText("事业方向");
    expect(first).toBeInTheDocument();
    fireEvent.click(first);
    expect(onSelect).toHaveBeenCalledWith("事业方向");
  });
});
```

Run: `pnpm --filter @eamvp/web test components/spirit/__tests__/QuickPrompts.test.tsx`
Expected: FAIL — `QuickPrompts` not found。

- [ ] **Step 2: 实现组件**

Create `apps/web/components/spirit/QuickPrompts.tsx`:

```tsx
"use client";

import { useT } from "@/lib/i18n/I18nProvider";

export function QuickPrompts({ onSelect }: { onSelect: (prompt: string) => void }) {
  const t = useT();
  const prompts = t("spirit.quickPrompts") as unknown as string[];

  return (
    <div className="w-full">
      <p className="mb-2 text-[12px] text-muted">想继续问：</p>
      <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className="shrink-0 rounded-[var(--radius-chip)] border border-[var(--color-line)] bg-surface px-3 py-2 text-[12px] text-ink-2 transition-colors active:bg-paper"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 运行测试**

Run: `pnpm --filter @eamvp/web test components/spirit/__tests__/QuickPrompts.test.tsx`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/spirit/QuickPrompts.tsx apps/web/components/spirit/__tests__/QuickPrompts.test.tsx
git commit -m "feat(spirit): add QuickPrompts component"
```

---

### Task 3: SpiritPanel compact 模式改造

**Files:**
- Modify: `apps/web/app/chart/SpiritPanel.tsx`
- Modify: `apps/web/app/spirit/page.tsx`

**Interfaces:**
- Consumes: `QuickPrompts.onSelect`、`useT()` 新 key、`SpiritPortrait` 改为 `compact`。
- Produces: `SpiritPanel` 行为不变，但 UI 结构变化；输入栏 sticky。

- [ ] **Step 1: 修改 `SpiritPanel.tsx` 结构**

把现有 `SpiritPanel` 中 `return` 的 `Card` 内部改造为：

```tsx
  const spirit = deriveSpirit(profile.chart);
  const accentVar = `var(--color-${spirit.dominantElement})`;
  const elementLabel = t(`chart.element${spirit.dominantElement.charAt(0).toUpperCase() + spirit.dominantElement.slice(1)}` as any);

  return (
    <div className="flex flex-1 flex-col">
      {/* compact hero */}
      <div className="flex items-center gap-3 px-4 pb-3 pt-2">
        <div
          className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-[var(--radius-card)]"
          style={{ background: "var(--color-ink)" }}
        >
          <span className="font-serif text-[32px] font-bold" style={{ color: accentVar }}>
            {elementLabel}
          </span>
        </div>
        <div className="min-w-0">
          <h2 className="font-serif text-[18px] font-bold leading-tight text-ink">{spirit.archetype}</h2>
          <p className="mt-0.5 text-[12px] text-muted">{elementLabel} · {t("spirit.online")}</p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-2">{spirit.coreTension}</p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
      >
        ...existing messages map...
      </div>

      {/* Error & Quick Prompts */}
      <div className="px-4 pb-2">
        {error rendering...}
        {!streaming && <QuickPrompts onSelect={(p) => setInput(p)} />}
      </div>

      {/* Sticky Input */}
      <form onSubmit={handleSubmit} className="sticky bottom-0 z-10 flex items-end gap-2 border-t border-[var(--color-line)] bg-paper px-4 py-3">
        ...existing textarea + send button...
      </form>
    </div>
  );
```

具体修改点（按行号）：

1. 文件顶部 import 增加 `QuickPrompts`：

```ts
import { QuickPrompts } from "@/components/spirit/QuickPrompts";
```

2. 删除 `SpiritPortrait` import 及 `Card` 的 `topAccent`（第 11-14 行、第 220-223 行）。

3. 删除 `const cinnabar = ...`（第 218 行），改为 `const accentVar = ...`。

4. 把 `return (<Card ...>` 改为上述结构。

- [ ] **Step 2: 确认 `spirit.coreTension` 存在**

`deriveSpirit` 返回 `SpiritPersona`，其中 `coreTension` 为一句成长课题，适合作为 compact hero 的副文案。若未来 core 类型变更，fallback 为 `spirit.archetype`。

- [ ] **Step 3: 运行相关测试**

Run: `pnpm --filter @eamvp/web test app/chart/__tests__/`
Expected: PASS（若 SpiritPanel 无现有测试，至少不引入失败）。

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/chart/SpiritPanel.tsx
git commit -m "feat(spirit): compact chat layout with sticky input and quick prompts"
```

---

### Task 4: SelfPortrait 支持 fullPage 模式

**Files:**
- Modify: `apps/web/app/chart/SelfPortrait.tsx`
- Modify/Create: `apps/web/app/chart/__tests__/SelfPortrait.test.tsx`

**Interfaces:**
- Consumes: `deriveSelfPortrait(chart, { questionnaire })`、`deriveSpirit(chart)`、`useT()`。
- Produces: `PortraitDimensions` 子组件；`SelfPortrait` 新增 `fullPage?: boolean` prop。

- [ ] **Step 1: 写 failing test**

Create/append `apps/web/app/chart/__tests__/SelfPortrait.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SelfPortrait } from "../SelfPortrait";
import { I18nProvider } from "@/lib/i18n/I18nProvider";

const mockChart = {} as any;

function Wrapper({ children }: { children: React.ReactNode }) {
  return <I18nProvider locale="zh">{children}</I18nProvider>;
}

describe("SelfPortrait", () => {
  it("renders compact card by default", () => {
    render(<SelfPortrait chart={mockChart} />, { wrapper: Wrapper });
    expect(screen.getByText("自我画像 · Self-Portrait")).toBeInTheDocument();
  });

  it("renders full page with note and CTA", () => {
    render(<SelfPortrait chart={mockChart} fullPage />, { wrapper: Wrapper });
    expect(screen.getByText("本命之灵的观察")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /和本命之灵聊聊这个/ })).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @eamvp/web test app/chart/__tests__/SelfPortrait.test.tsx`
Expected: FAIL — `fullPage` prop 不存在。

- [ ] **Step 2: 拆分 PortraitDimensions 并支持 fullPage**

Rewrite `apps/web/app/chart/SelfPortrait.tsx`:

```tsx
"use client";

import { deriveSelfPortrait, deriveSpirit } from "@eamvp/core";
import type { QuestionnaireAnswers } from "@eamvp/core";
import type { Profile } from "@/lib/profiles";
import { Card } from "@/components/ui";
import { useT } from "@/lib/i18n/I18nProvider";
import { SpiritSigil } from "./SpiritSigil";

const DIM_ELEMENT: Record<string, "wood" | "fire" | "earth" | "metal" | "water"> = {
  grounding: "earth",
  drive: "fire",
  reflection: "water",
  connection: "wood",
  openness: "metal",
};

const ELEMENT_COLORS: Record<string, string> = {
  wood: "var(--color-wood)",
  fire: "var(--color-fire)",
  earth: "var(--color-earth)",
  metal: "var(--color-metal)",
  water: "var(--color-water)",
};

export function PortraitDimensions({
  dimensions,
}: {
  dimensions: { key: string; label: string; value: number }[];
}) {
  return (
    <div className="space-y-4">
      {dimensions.map((dim) => (
        <div key={dim.key} className="grid grid-cols-[80px_1fr_28px] items-center gap-3 sm:grid-cols-[96px_1fr_28px]">
          <span className="text-[13px] text-ink-2">{dim.label}</span>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--color-line)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${dim.value * 10}%`, background: ELEMENT_COLORS[DIM_ELEMENT[dim.key] ?? "earth"] }}
            />
          </div>
          <span className="text-right text-[13px] tabular-nums text-muted">{dim.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SelfPortrait({
  chart,
  questionnaire,
  fullPage = false,
  onTalk,
}: {
  chart: Profile["chart"];
  questionnaire?: QuestionnaireAnswers;
  fullPage?: boolean;
  onTalk?: () => void;
}) {
  const t = useT();
  const portrait = deriveSelfPortrait(chart, { questionnaire, memoryPresent: false });
  const spirit = deriveSpirit(chart);

  if (fullPage) {
    return (
      <div className="flex flex-col gap-5 px-5 pb-24 pt-6">
        <div className="flex flex-col items-center text-center">
          <div
            className="mb-4 flex h-[96px] w-[96px] items-center justify-center rounded-full"
            style={{ background: "var(--color-ink)" }}
          >
            <SpiritSigil element={spirit.dominantElement} size={48} />
          </div>
          <h1 className="font-serif text-[24px] font-black text-ink">{spirit.archetype}</h1>
          <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-2">{portrait.note}</p>
        </div>

        <Card>
          <h2 className="mb-4 text-[15px] font-semibold text-ink-2">{t("chart.selfPortraitTitle")}</h2>
          <PortraitDimensions dimensions={portrait.dimensions} />
        </Card>

        <Card>
          <h2 className="mb-3 text-[15px] font-semibold text-ink-2">{t("spirit.portraitNoteTitle")}</h2>
          <p className="text-[14px] leading-relaxed text-ink-2">{portrait.note}</p>
        </Card>

        <button
          type="button"
          onClick={onTalk}
          className="h-[52px] w-full rounded-[var(--radius-button)] bg-cinnabar text-[16px] font-medium text-white"
        >
          {t("spirit.talkAboutPortrait")}
        </button>
      </div>
    );
  }

  return (
    <Card className="mb-6" topAccent={portrait.dominantElement as "wood" | "fire" | "earth" | "metal" | "water"}>
      <div className="mb-5 flex items-center gap-3">
        <SpiritSigil element={spirit.dominantElement} size={44} />
        <div className="min-w-0">
          <h3 className="font-serif text-[17px] font-semibold leading-tight">{t("chart.selfPortraitTitle")}</h3>
          <p className="mt-0.5 text-[12px] text-muted">{t("chart.selfPortraitSubtitle")}</p>
        </div>
      </div>
      <PortraitDimensions dimensions={portrait.dimensions} />
      <p className="mt-5 text-[13px] italic leading-relaxed text-muted">{portrait.note}</p>
    </Card>
  );
}
```

- [ ] **Step 3: 运行测试**

Run: `pnpm --filter @eamvp/web test app/chart/__tests__/SelfPortrait.test.tsx`
Expected: PASS。

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/chart/SelfPortrait.tsx apps/web/app/chart/__tests__/SelfPortrait.test.tsx
git commit -m "feat(spirit): SelfPortrait fullPage mode with PortraitDimensions"
```

---

### Task 5: 新建 `/spirit/portrait` 页面

**Files:**
- Create: `apps/web/app/spirit/portrait/page.tsx`
- Create: `apps/web/app/spirit/portrait/__tests__/page.test.tsx`（可选，若已有 page 测试模式则跟）

**Interfaces:**
- Consumes: `getActiveProfile`、`getQuestionnaire`、`SelfPortrait` fullPage、`useT()`。
- Produces: Next.js App Router page component。

- [ ] **Step 1: 创建页面**

Create `apps/web/app/spirit/portrait/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getActiveProfile, getQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile, tgGetQuestionnaire } from "@/lib/tg/client";
import type { QuestionnaireAnswers } from "@eamvp/core";
import { SelfPortrait } from "@/app/chart/SelfPortrait";
import { useT } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

export default function SpiritPortraitPage() {
  const t = useT();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [qAnswers, setQAnswers] = useState<QuestionnaireAnswers | null | undefined>(undefined);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => {
        setProfile(p);
        if (p) {
          (hasTgSession() ? tgGetQuestionnaire() : getQuestionnaire(p.id))
            .then((q) => setQAnswers((q as QuestionnaireAnswers | null) ?? null))
            .catch(() => setQAnswers(null));
        }
      })
      .catch(() => setProfile(null));
  }, []);

  if (!ENABLED) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-muted">{t("spirit.notEnabled")}</p>
      </main>
    );
  }

  if (profile === undefined) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-muted">{t("spirit.loadingProfile")}</p>
      </main>
    );
  }

  if (profile === null) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
        <p className="text-ink-2">{t("spirit.noProfile")}</p>
        <Link
          href="/reading"
          className="mt-4 inline-block px-6 py-3 text-on-ink"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}
        >
          {t("spirit.goCast")}
        </Link>
      </main>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-20 flex h-[56px] items-center justify-between border-b border-[var(--color-line)] bg-surface px-4">
        <h1 className="font-serif text-[18px] font-bold text-ink">{t("spirit.portraitPageTitle")}</h1>
        <button
          type="button"
          className="rounded-[var(--radius-chip)] bg-paper px-3 py-1.5 text-[12px] text-ink-2"
          onClick={() => {
            if (navigator.share) {
              void navigator.share({ title: t("spirit.portraitPageTitle"), url: window.location.href });
            }
          }}
        >
          {t("spirit.share")}
        </button>
      </header>
      <SelfPortrait
        chart={profile.chart}
        questionnaire={qAnswers ?? undefined}
        fullPage
        onTalk={() => {
          router.push("/spirit");
        }}
      />
    </>
  );
}
```

- [ ] **Step 2: 验证路由可达**

Run: `pnpm --filter @eamvp/web build`
Expected: 成功（检查 `/spirit/portrait` 路由编译无报错）。

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/spirit/portrait/page.tsx
git commit -m "feat(spirit): add /spirit/portrait page"
```

---

### Task 6: 改造 `/spirit` 主页面

**Files:**
- Modify: `apps/web/app/spirit/page.tsx`

**Interfaces:**
- Consumes: `SpiritPanel` 已更新；`useT()` 新 key。
- Produces: 新页面布局。

- [ ] **Step 1: 重写 `/spirit/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import { hasTgSession, tgGetProfile } from "@/lib/tg/client";
import { SpiritPanel } from "@/app/chart/SpiritPanel";
import { useT } from "@/lib/i18n/I18nProvider";

const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1";

export default function SpiritPage() {
  const t = useT();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);

  useEffect(() => {
    if (!ENABLED) return;
    (hasTgSession() ? tgGetProfile() : getActiveProfile())
      .then((p: Profile | null) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  if (!ENABLED) {
    return (
      <Centered>
        <p className="text-muted">{t("spirit.notEnabled")}</p>
      </Centered>
    );
  }

  if (profile === undefined) return <Centered>{t("spirit.loadingProfile")}</Centered>;

  if (profile === null) {
    return (
      <Centered>
        <p className="text-ink-2">{t("spirit.noProfile")}</p>
        <Link
          href="/reading"
          className="mt-4 inline-block px-6 py-3 text-on-ink"
          style={{ background: "var(--color-cinnabar)", borderRadius: "var(--radius-button)" }}
        >
          {t("spirit.goCast")}
        </Link>
      </Centered>
    );
  }

  return (
    <main className="flex h-[100dvh] flex-col">
      <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-[var(--color-line)] bg-surface px-4">
        <Link href="/chart" className="flex items-center gap-1 text-[14px] text-ink-2">
          <span>←</span>
          <span>{t("common.back")}</span>
        </Link>
        <Link
          href="/spirit/portrait"
          className="text-[13px] text-cinnabar"
        >
          {t("spirit.viewPortrait")}
        </Link>
      </header>
      <SpiritPanel profile={profile} />
      <p className="px-5 pb-2 pt-1 text-[11px] leading-relaxed text-muted">{t("spirit.disclaimer")}</p>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">{children}</main>;
}
```

- [ ] **Step 2: 移除不再使用的 import**

删除 `getQuestionnaire`、`QuestionnaireAnswers`、`Questionnaire`、`SelfPortrait` 的 import。

- [ ] **Step 3: 运行测试与 typecheck**

Run: `pnpm typecheck`
Expected: PASS。

Run: `pnpm --filter @eamvp/web test app/spirit/`
Expected: PASS 或无测试失败。

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/spirit/page.tsx
git commit -m "feat(spirit): compact /spirit page with link to portrait"
```

---

### Task 7: AppShell active 状态与 safe-area

**Files:**
- Modify: `apps/web/components/AppShell.tsx`

**Interfaces:**
- Consumes: `usePathname()`。
- Produces: `/spirit/portrait` 高亮「灵」nav item。

- [ ] **Step 1: 修改 `isActive` 逻辑**

Current:

```ts
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
```

This already makes `/spirit/portrait` active for `/spirit`, because `pathname.startsWith("/spirit")` is true. No change needed.

- [ ] **Step 2: 验证 mobile bottom nav 在 spirit 页正常显示**

Run: `pnpm --filter @eamvp/web build`
Expected: PASS。

- [ ] **Step 3: Commit（若未改动则跳过）**

---

### Task 8: 集成测试与回归

**Files:**
- All above

- [ ] **Step 1: 运行 web 全部测试**

Run: `pnpm --filter @eamvp/web test`
Expected: PASS。

- [ ] **Step 2: 运行 typecheck**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 3: 运行 lint（若项目配置了）**

Run: `pnpm --filter @eamvp/web lint`
Expected: PASS 或命令不存在则跳过。

- [ ] **Step 4: 本地构建验证**

Run: `pnpm --filter @eamvp/web build`
Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(spirit): regression for mobile UI refactor"
```

---

## Self-Review

**Spec coverage:**
- ✅ 灵对话页紧凑形象卡 — Task 3
- ✅ 消息区 flex-1 自适应 — Task 3
- ✅ sticky 输入栏 — Task 3
- ✅ 快捷提问 chips — Task 1 + Task 2 + Task 3
- ✅ `/spirit/portrait` 独立页 — Task 4 + Task 5
- ✅ 五维画像 + 观察 + CTA — Task 4
- ✅ 不改 core/llm/db — Global Constraints
- ✅ 不做问卷 onboarding — 已从 `/spirit/page.tsx` 移除 `Questionnaire`

**Placeholder scan:**
- 无 TBD/TODO。
- `spirit.coreTension` 在 Task 3 作为 compact hero 副文案，fallback 为 `spirit.archetype`。

**Type consistency:**
- `PortraitDimensions` 接收 `dimensions`，按 `dim.key` 映射五行色。
- `SelfPortrait` 新增 `fullPage?: boolean` 和 `onTalk?: () => void`。
- `QuickPrompts.onSelect` 签名统一为 `(prompt: string) => void`。

**Telegram 兼容：**
- `SpiritPanel` 的 `isTelegram()` 分支保持原样；TG 内仍然隐藏全局 bottom nav 并使用 TG MainButton。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-spirit-mobile-ui.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints for review.

Which approach?
