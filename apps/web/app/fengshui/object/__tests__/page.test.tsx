import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@eamvp/core";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

vi.mock("@/lib/profiles", () => ({ getActiveProfile: vi.fn(async () => profile) }));
vi.mock("@/lib/tg/client", () => ({ hasTgSession: () => false, tgGetProfile: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/fengshui/object" }));

/**
 * 与 apps/web/app/fengshui/__tests__/page.test.tsx 同一个已知陷阱：本页在组件体内
 * 直接调用 useT()，一旦某条测试 vi.resetModules() 后动态 import 本页，Wrapper 用的
 * I18nProvider 若仍是静态 import，会落在两份不同模块图上、useContext 找不到匹配的
 * Provider。这里统一用 renderPage()，每次都从同一次动态 import 里取 Page 与
 * I18nProvider，并在 beforeEach 无条件 resetModules，不依赖测试书写顺序。
 */
async function renderPage() {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider locale="zh">{children}</I18nProvider>;
  }
  return render(<Page />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  vi.stubGlobal("fetch", vi.fn(async () => new Response("放东边靠墙就好。")));
});

describe("EP-fs-08 /fengshui/object 页面", () => {
  it("flag 关闭时显示未开启文案，不渲染表单", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    await renderPage();
    expect(screen.getByText("「境」尚未开启。")).toBeInTheDocument();
    expect(screen.queryByLabelText("品类")).toBeNull();
  });

  it("无档案时提示先起盘，并给出 /reading 链接，不渲染表单", async () => {
    const profiles = await import("@/lib/profiles");
    vi.mocked(profiles.getActiveProfile).mockResolvedValueOnce(null);
    await renderPage();
    await waitFor(() => expect(screen.getByText("还没有命盘档案，先起一个盘。")).toBeInTheDocument());
    expect(screen.getByText("去起盘").closest("a")).toHaveAttribute("href", "/reading");
    expect(screen.queryByLabelText("品类")).toBeNull();
  });

  it("有档案时渲染标题与物件顾问表单，且带回「境」主页面的链接", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByLabelText("品类")).toBeInTheDocument());
    expect(screen.getByText("我想添置…")).toBeInTheDocument();
    const backLink = screen.getByText("← 境");
    expect(backLink.closest("a")).toHaveAttribute("href", "/fengshui");
  });
});
