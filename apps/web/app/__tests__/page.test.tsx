import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";

/**
 * 首页 TG 入口列表（`TG_ENTRIES`）的回归测试。
 *
 * 为什么这个文件此前不存在、而它必须存在：
 * `AppShell.tsx:40` 用 `{!tg && (…)}` 把桌面侧栏与移动底栏**整个**包住——Telegram 里
 * 不渲染任何 web 导航（既有的 TG 原生化设计）。于是 TG 内唯一的导航就是本页的
 * `TG_ENTRIES`，一份**硬编码**列表。任何新功能只往 `AppShell.NAV` 里加入口，
 * 在 TG 里就是**零入口**——风水「境」正是这么静默失踪的（flag 已开、页面已上线、
 * 但 TG 用户走不到），而全套测试当时是绿的，因为没有任何测试覆盖 `TG_ENTRIES`。
 *
 * 本文件把「web 有入口 ⇒ TG 也要有入口」变成可失败的断言。
 */

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => "/",
}));

const tgEnv = { inTg: true };
vi.mock("@/lib/tg/client", () => ({
  isTelegram: () => tgEnv.inTg,
  hasTgSession: () => false,
  tgGetProfile: vi.fn(),
}));

vi.mock("@/components/DarkImage", () => ({
  DarkImage: () => null,
  default: () => null,
}));

/**
 * ⚠️ `page.tsx` 顶层 `const ENABLED = process.env.NEXT_PUBLIC_* === "1"` 在**模块加载时**
 * 求值，所以必须 `resetModules()` 之后再动态 import；而 `I18nProvider` 必须出自**同一次**
 * 动态 import，否则 `useT()` 拿到的 Context 实例与 Wrapper 提供的对不上、直接抛错。
 * 波1、波2 都栽过这个坑，spirit/fengshui 两处测试的注释里都记着。
 */
async function renderHome() {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider locale="zh">{children}</I18nProvider>;
  }
  return render(<Page />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.resetModules();
  tgEnv.inTg = true;
  routerPush.mockReset();
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  // EP-fs-debt：「灵」此前无条件显示（TG_ENTRIES 里没有 flag 门控，AppShell.NAV
  // 却有），默认开着让既有用例（假设「本命之灵」在场）继续成立，专门的开关测试见
  // 下面新增的 describe 块。
  vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("TG 首页入口列表：风水「境」", () => {
  it("TG 内 + flag 开：「境」入口出现，且点击后真的导向 /fengshui", async () => {
    await renderHome();
    // 钉住标题文本而不是图标字「境」——图标字是单字，容易与其它文案里的字撞；
    // 而 title 是这一行的语义身份。
    const cell = await screen.findByText("居家风水");
    fireEvent.click(cell);
    // 只断言「入口存在」抓不到「入口存在但点了没反应/指错地方」。
    expect(routerPush).toHaveBeenCalledWith("/fengshui");
  });

  it("TG 内 + flag 关：「境」入口不出现（与 AppShell.NAV 的门控保持一致）", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    await renderHome();
    // 先确认列表本身渲染出来了，否则下面的「不出现」会因为整页没渲染而恒真。
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("居家风水")).toBeNull();
    // 同时确认没有任何一行会把用户带去 /fengshui
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("既有五项不受影响（防止加入口时挤掉别人）", async () => {
    await renderHome();
    for (const label of ["今日运势", "我的命盘", "本命之灵", "起盘建档", "我的档案"]) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
  });

  it("非 TG（普通 web）：不渲染 TG 入口列表——那里的入口是 AppShell 的底部导航", async () => {
    tgEnv.inTg = false;
    await renderHome();
    // ⚠️ 判别依据不能用「今日运势」：web 版首页的入口卡片（`home.entries.calendar`）
    // 用的是同一个词，两个宿主都渲染它，拿它当判据会恒真。必须用 TG 列表**独有**的项——
    // `home.tg.entries.profiles`「我的档案」在 web 版 `home.entries.*`（calendar/annual/
    // chart/reading）里没有对应项。第一次写这条测试时就是踩了这个坑，它自己红了出来。
    await waitFor(() => expect(screen.queryByText("我的档案")).toBeNull());
    expect(screen.queryByText("居家风水")).toBeNull();
  });
});

describe("web 首页目录列表：解梦「梦」（inTg=false 臂）", () => {
  it("web 臂 + flag 开：「解梦」条目出现，且 Link href=\"/dream\"", async () => {
    tgEnv.inTg = false;
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    await renderHome();
    // 先确认 web 目录列表本身渲染出来了，否则后面的断言会因整臂缺席而失真
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    // web 臂的条目是 <Link href>（不是 TG 臂的 onClick Cell），href 必须钉死
    const link = (await screen.findByText("解梦")).closest("a");
    expect(link).not.toBeNull();
    expect(link!.getAttribute("href")).toBe("/dream");
  });

  it("web 臂 + flag 关：「解梦」条目不出现", async () => {
    tgEnv.inTg = false;
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    await renderHome();
    // 先确认列表渲染（防恒真），再断言缺席
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("解梦")).toBeNull();
  });
});

describe("TG 首页入口列表：本命之灵「灵」（EP-fs-debt：补齐此前缺失的 flag 门控）", () => {
  it("TG 内 + flag 开：「灵」入口出现，且点击后真的导向 /spirit", async () => {
    await renderHome();
    const cell = await screen.findByText("本命之灵");
    fireEvent.click(cell);
    expect(routerPush).toHaveBeenCalledWith("/spirit");
  });

  it("TG 内 + flag 关：「灵」入口不出现（与 AppShell.NAV 的门控保持一致）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    await renderHome();
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("本命之灵")).toBeNull();
    expect(routerPush).not.toHaveBeenCalled();
  });
});

describe("TG 首页入口列表：解梦「梦」", () => {
  it("TG 内 + flag 开：「解梦」入口出现，点击导向 /dream", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    await renderHome();
    const cell = await screen.findByText("解梦");
    fireEvent.click(cell);
    expect(routerPush).toHaveBeenCalledWith("/dream");
  });

  it("TG 内 + flag 关：「解梦」入口不出现", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    await renderHome();
    expect(await screen.findByText("今日运势")).toBeInTheDocument();
    expect(screen.queryByText("解梦")).toBeNull();
  });
});

describe("TG 首页页头改用 PageHeader（EP-tg-parity）", () => {
  it("头部渲染为 PageHeader（宋体 h1 + 眉标 + 副标注），不是手写 div", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    tgEnv.inTg = true;
    const { container } = await renderHome();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("照见");
    expect(screen.getByText("— 卷 首 —")).toBeInTheDocument();
    expect(screen.getByText("你的命盘，是一面镜子")).toBeInTheDocument();
    // 结构性断言：PageHeader 渲染的 <header> 标签本身作为判别依据——
    // 文本断言在实现前就可能碰巧通过，只有这条能真正验证「改用了 PageHeader」。
    expect(container.querySelector("header")).not.toBeNull();
  });
});
