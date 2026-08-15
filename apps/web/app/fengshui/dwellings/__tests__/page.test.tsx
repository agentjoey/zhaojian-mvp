import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@eamvp/core";
import type { Dwelling } from "@/lib/dwellings";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

vi.mock("@/lib/profiles", () => ({ getActiveProfile: vi.fn(async () => profile) }));
vi.mock("@/lib/tg/client", () => ({ hasTgSession: () => false, tgGetProfile: vi.fn() }));

/**
 * `DwellingForm`（本页下半部分永远渲染）也从 `@/lib/dwellings` 取
 * `createDwelling`/`updateDwelling`，一并在这里 mock，避免真的打 supabase——但本文件
 * 不断言这两个函数的调用，所以直接内联桩实现即可（与 DwellingForm.test.tsx 里
 * `updateDwelling: vi.fn(async () => {})` 同一种写法）。只有 `listDwellings`/
 * `deleteDwelling` 需要外层 const + 间接包装：本文件要在各条测试里用
 * `.mockResolvedValue`/`.mockRejectedValueOnce` 等重新配置它们、并断言调用参数——
 * 工厂函数体本身只返回箭头函数，箭头函数体内部才读外层 const，真正的读取发生在
 * 这些箭头函数被调用的那一刻（远晚于本文件顶层 const 已初始化完毕），不是 vi.mock
 * 工厂体自身执行的那一刻，不存在暂时性死区问题（与 fengshui/page.test.tsx 里
 * reportStore 那段注释是同一个道理）。
 */
const listDwellings = vi.fn(async (): Promise<Dwelling[]> => []);
const deleteDwelling = vi.fn<(id: string) => Promise<void>>(async () => {});
vi.mock("@/lib/dwellings", () => ({
  listDwellings: () => listDwellings(),
  deleteDwelling: (id: string) => deleteDwelling(id),
  createDwelling: vi.fn(async (d: unknown) => ({ id: "new", ...(d as object) })),
  updateDwelling: vi.fn(async () => {}),
}));

/**
 * 已知陷阱（与 object/page.test.tsx、fengshui/page.test.tsx 同一处）：page.tsx 组件体内
 * 直接调用 useT()。若某条测试 vi.resetModules() 后动态 import 本页，Wrapper 用的
 * I18nProvider 若仍是文件顶层的静态 import，会落在两份不同的模块图上、各自持有不同的
 * I18nContext 实例，useContext 找不到匹配的 Provider 而抛错。这里统一用 renderPage()：
 * 每次渲染都把 Page 与 I18nProvider 从同一次动态 import 里取出，并在 beforeEach 里无条件
 * resetModules，不依赖测试书写顺序。
 */
async function renderPage() {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider locale="zh">{children}</I18nProvider>;
  }
  return render(<Page />, { wrapper: Wrapper });
}

const D1: Dwelling = { id: "d1", name: "家A", kind: "home", tenancy: "rent", facing: "S", memberProfileIds: [] };
const D2: Dwelling = { id: "d2", name: "家B", kind: "office", tenancy: "own", facing: null, memberProfileIds: [] };

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  listDwellings.mockReset().mockResolvedValue([]);
  deleteDwelling.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("confirm", vi.fn(() => true));
});

describe("EP-fs-14 /fengshui/dwellings 管理页", () => {
  it("flag 关闭时显示未开启文案，不渲染列表", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    await renderPage();
    expect(screen.getByText("「境」尚未开启。")).toBeInTheDocument();
    expect(screen.queryByText("我的居所")).toBeNull();
  });

  it("列表渲染：朝向显示为中文名，facing 为 null 时显示「不确定」而非空白", async () => {
    listDwellings.mockResolvedValue([D1, D2]);
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    // 逐字比对整行拼接文本（kind · tenancy · facing），而不是用 /南/ 之类的子串正则——
    // "南" 同时是"东南""西南"的子串，子串匹配在方位场景下极易假阳性
    // （DwellingForm.test.tsx 已经在方位按钮测试上踩过同一个坑）。
    expect(screen.getByText("住宅 · 租住 · 南")).toBeInTheDocument();
    expect(screen.getByText("家B")).toBeInTheDocument();
    expect(screen.getByText("办公 · 自有 · 不确定")).toBeInTheDocument();
  });

  it("确认框取消 → deleteDwelling 未被调用，列表不变", async () => {
    listDwellings.mockResolvedValue([D1]);
    vi.stubGlobal("confirm", vi.fn(() => false));
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(deleteDwelling).not.toHaveBeenCalled();
    expect(screen.getByText("家A")).toBeInTheDocument();
  });

  it("确认框接受 → deleteDwelling 被调用，该项从列表移除", async () => {
    listDwellings.mockResolvedValue([D1]);
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(deleteDwelling).toHaveBeenCalledWith("d1"));
    await waitFor(() => expect(screen.queryByText("家A")).toBeNull());
  });

  it("删除失败：有可见反馈，且该项仍在列表里（不能假装删除成功）", async () => {
    listDwellings.mockResolvedValue([D1]);
    deleteDwelling.mockRejectedValueOnce(new Error("network down"));
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    await waitFor(() => expect(deleteDwelling).toHaveBeenCalledWith("d1"));
    await waitFor(() => expect(screen.getByText("删除失败，请重试")).toBeInTheDocument());
    // 失败必须不能悄悄把这条从列表里摘掉——摘掉了就是在向用户撒谎说"删除成功了"
    expect(screen.getByText("家A")).toBeInTheDocument();
  });

  it("Minor：删除进行中按钮禁用，快速二次点击不会对同一 id 发两次删除请求", async () => {
    listDwellings.mockResolvedValue([D1]);
    let resolveDelete!: () => void;
    deleteDwelling.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveDelete = resolve; }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    const btn = screen.getByRole("button", { name: "删除" });
    fireEvent.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
    fireEvent.click(btn); // 删除进行中再点一次：按钮应已禁用，不应再发起第二次请求
    expect(deleteDwelling).toHaveBeenCalledTimes(1);
    resolveDelete();
    await waitFor(() => expect(screen.queryByText("家A")).toBeNull());
  });
});
