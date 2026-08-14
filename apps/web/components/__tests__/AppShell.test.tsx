import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { zh } from "@/lib/i18n/messages/zh";
import { en } from "@/lib/i18n/messages/en";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
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
