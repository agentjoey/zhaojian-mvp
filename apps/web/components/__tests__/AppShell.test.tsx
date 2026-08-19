import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { zh } from "@/lib/i18n/messages/zh";
import { en } from "@/lib/i18n/messages/en";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("EP-dream 导航「梦」flag 门控", () => {
  it("flag 关闭时导航不含「解梦」", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    const { AppShell } = await import("../AppShell");
    // 与「境」用例同一约束：I18nProvider 必须来自同一次动态 import（context 身份匹配）。
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    // 先确认导航本身渲染出来了，否则「不含」会因整树缺席而恒真
    expect(screen.getAllByLabelText("运势").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("解梦")).toBeNull();
  });

  it("flag 开启时导航含「解梦」且指向 /dream", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    const links = screen.getAllByLabelText("解梦");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute("href")).toBe("/dream");
  });
});

describe("EP-fs-07 导航「境」flag 门控", () => {
  it("flag 关闭时导航不含「境」", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    const { AppShell } = await import("../AppShell");
    // NAV 在模块加载时读取 process.env，须与 AppShell 同一次动态 import 求值；
    // I18nProvider 也必须来自同一份刚重置的模块图，否则 useT() 读到的
    // I18nContext 实例会与 Wrapper 提供的不是同一个对象，导致
    // "useT must be used within <I18nProvider>"（模块重置后 context 身份不匹配）。
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    expect(screen.queryByLabelText("境")).toBeNull();
  });

  it("flag 开启时导航含「境」且指向 /fengshui", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    vi.resetModules();
    const { AppShell } = await import("../AppShell");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <I18nProvider locale="zh">{children}</I18nProvider>
    );
    render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
    const links = screen.getAllByLabelText("境");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]!.getAttribute("href")).toBe("/fengshui");
  });
});

/**
 * 最终评审 Blocking 4：导航项内边距（px-2 → px-1.5）此前无条件生效，违反 spec §10
 * 「≥6 项时才收紧间距」——三个 flag 都关闭时（NAV.length=4）也被收紧，触控目标从
 * 52px 缩到 48px（虽仍高于 44px 下限，但这是本分支「flag 关闭时产品行为完全不变」
 * 约束的唯一字面违反）。这里钉住：只有 NAV.length ≥ 6 时才用
 * px-1.5，其余情况（含默认的全部 flag 都关）必须是 px-2。每条用例都把三个 flag
 * 全 stub 掉，防止将来某个 flag 在环境里开着跑测试时误判。
 * 用「运」（nav.calendar）这个恒定存在、不受任何 flag 影响的导航项作探针，避免依赖
 * 「境」/「灵」这类本身就受 flag 控制是否渲染的项。
 */
async function renderShellAndGetNavItemClassNames(): Promise<string[]> {
  const { AppShell } = await import("../AppShell");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <I18nProvider locale="zh">{children}</I18nProvider>
  );
  render(<AppShell><div /></AppShell>, { wrapper: Wrapper });
  // 「运势」（nav.calendar）在桌面栏 + 移动栏各出现一次，两处应保持同一套间距规则；
  // aria-label 取自 t(item.key) 而非导航图标字符本身——「运势」两字，不是图标位显示的单字「运」。
  return screen.getAllByLabelText("运势").map((el) => el.className);
}

function hasClassToken(className: string, token: string): boolean {
  return className.split(/\s+/).includes(token);
}

describe("最终评审 Blocking 4：导航内边距按 NAV.length ≥ 6 门控（而非无条件生效）", () => {
  it("三个 flag 都关闭时（NAV.length=4）导航项用 px-2，不收紧", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    const classNames = await renderShellAndGetNavItemClassNames();
    expect(classNames.length).toBeGreaterThan(0);
    for (const cn of classNames) {
      expect(hasClassToken(cn, "px-2")).toBe(true);
      expect(hasClassToken(cn, "px-1.5")).toBe(false);
    }
  });

  it("只开一个 flag 时（NAV.length=5，仍 <6）导航项仍用 px-2", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    const classNames = await renderShellAndGetNavItemClassNames();
    expect(classNames.length).toBeGreaterThan(0);
    for (const cn of classNames) {
      expect(hasClassToken(cn, "px-2")).toBe(true);
      expect(hasClassToken(cn, "px-1.5")).toBe(false);
    }
  });

  it("风水 + 灵都开启、梦关闭时（NAV.length=6）导航项收紧为 px-1.5", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    const classNames = await renderShellAndGetNavItemClassNames();
    expect(classNames.length).toBeGreaterThan(0);
    for (const cn of classNames) {
      expect(hasClassToken(cn, "px-1.5")).toBe(true);
      expect(hasClassToken(cn, "px-2")).toBe(false);
    }
  });
});

/** 递归收集对象的全部叶子键路径（数组视为叶子），用于比较字典结构。 */
function collectKeyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return [prefix];
  }
  const paths: string[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(...collectKeyPaths(value, path));
  }
  return paths;
}

describe("EP-fs-07 i18n fengshui 命名空间键结构一致性", () => {
  it("zh 与 en 的 fengshui 命名空间键路径完全一致", () => {
    // 显式断言两侧命名空间均已存在，避免「双方都缺失」时误判通过。
    expect(zh.fengshui).toBeDefined();
    expect(en.fengshui).toBeDefined();

    const zhPaths = collectKeyPaths(zh.fengshui).sort();
    const enPaths = collectKeyPaths(en.fengshui).sort();
    expect(enPaths).toEqual(zhPaths);
  });
});
