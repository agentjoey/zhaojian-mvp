import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@eamvp/core";
import type { Dwelling } from "@/lib/dwellings";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

// Task 9b：DwellingForm（本页下半部分永远渲染）新增会调 listProfiles()/getActiveProfileId()
// 拉同住人候选。本文件不测同住人 UI，只需让它不崩——回主档案自己一条即可（会被
// DwellingForm 内部按 activeId 过滤掉，候选区块不渲染，不影响本文件任何既有断言）。
vi.mock("@/lib/profiles", () => ({
  getActiveProfile: vi.fn(async () => profile),
  listProfiles: vi.fn(async () => [profile]),
  getActiveProfileId: () => "p1",
}));
vi.mock("@/lib/tg/client", () => ({ hasTgSession: () => false, tgGetProfile: vi.fn() }));

/**
 * Task 10（EP-fs-17 会员闸门）：本页新增直接 import `@/lib/supabase`（读会话
 * access_token，附到 /api/fengshui/reading 的闸门探测请求头上）。真实实现在没配
 * NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY 时会抛错（同 lib/__tests__/dwellings.test.ts、
 * fengshui/__tests__/page.test.tsx 踩过的同一个坑），必须 mock 掉。默认
 * `session: null`——绝大多数测试不关心「服务端具体怎么识别身份」。
 *
 * 修复单 Important 4：会话内容改成可按测试改写的共享可变量（`vi.hoisted`，理由同
 * fengshui/__tests__/page.test.tsx 里的同名夹具：renderPage() 每次 resetModules +
 * 动态 import，直接摆弄 mock 实例会打到一个页面根本不会调用到的旧实例）。写死
 * `session: null` 意味着「探测请求到底带不带 Authorization」全程零断言。
 */
const { supabaseSession } = vi.hoisted(() => ({
  supabaseSession: { current: null as { access_token: string } | null },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({ auth: { getSession: vi.fn(async () => ({ data: { session: supabaseSession.current } })) } }),
}));

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
  // Task 10：新增的会员闸门探测 effect 是又一条异步 setState 链路（继 profile/
  // dwellings 加载之后）。用 `await act(async () => { render(...) })` 让 act 显式
  // 排空 render 触发的首批微任务再返回——与 fengshui/__tests__/page.test.tsx 的
  // renderPage() 同一个理由、同一个手法（见该文件顶部注释：加这层包裹前大量用例
  // 会报 "not wrapped in act"，加之后清零）。
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Page />, { wrapper: Wrapper });
  });
  return result;
}

const D1: Dwelling = { id: "d1", name: "家A", kind: "home", tenancy: "rent", facing: "S", memberProfileIds: [] };
const D2: Dwelling = { id: "d2", name: "家B", kind: "office", tenancy: "own", facing: null, memberProfileIds: [] };

/** 会员闸门探测（Task 10）响应；route 现在返回 JSON `{ entitled }`。 */
function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  listDwellings.mockReset().mockResolvedValue([]);
  deleteDwelling.mockReset().mockResolvedValue(undefined);
  supabaseSession.current = null;
  vi.stubGlobal("confirm", vi.fn(() => true));
  // 默认 entitled:true（对应「未开闸」或「已是会员」——本页分不清也不需要分清这两种；
  // 哪种具体情形由本文件末尾「会员闸门」describe 块专门覆盖）。这保证了 Task 10
  // 之前就存在的既有测试（含下面用到 2 个居所的「列表渲染」测试）无需逐个改动。
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ entitled: true })));
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

/**
 * 会员闸门（Task 10，EP-fs-17）。spec §11 边界：多套居所是会员功能——非会员只能
 * 保存一个，第二个起触发 Paywall；已保存的第一个不受影响（本页不删列表，只挡
 * 「新增」区域）。全程受 BILLING_ENABLED 门控（无 NEXT_PUBLIC_ 前缀，页面读不到，
 * 只能靠 GET /api/fengshui/reading 返回的 entitled 布尔值）。
 *
 * 没有居所（首套）时不发起闸门探测——首套永远免费，探测结果不影响任何 UI，见
 * page.tsx 里 `if (!dwellings || dwellings.length === 0)` 的守卫；下面专门有一条
 * 测试锁定「不该发起这次请求」，防止这个「减少无意义请求」的设计被悄悄破坏。
 */
describe("EP-fs-17 会员闸门（Task 10）：只能保存一个居所，第二个触发 Paywall", () => {
  it("已有 1 个居所且非会员：「新增」区域显示 Paywall，不显示表单；已保存的居所不受影响", async () => {
    listDwellings.mockResolvedValue([D1]);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ entitled: false })));
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("升级会员，解锁无限")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "保存" })).toBeNull();
    // 挡的是「新增」，不是已经保存的居所——列表仍然完整可见
    expect(screen.getByText("家A")).toBeInTheDocument();
  });

  it("已有 1 个居所且是会员：「新增」区域正常显示表单，不显示 Paywall", async () => {
    listDwellings.mockResolvedValue([D1]);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ entitled: true })));
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument());
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
  });

  it("route 判定 entitled:true（对应 BILLING_ENABLED 关闭，或已是会员）：即使已有多个居所，新增表单也不受限——对照组", async () => {
    // 与上一条「非会员 → Paywall」用相同的居所数量级（这里甚至更多，2 个），
    // 唯一变量是 entitled 的值——证明真正决定渲染结果的是这个信号，不是别的。
    listDwellings.mockResolvedValue([D1, D2]);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ entitled: true })));
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument());
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
  });

  it("没有居所（首套）：即使 route 判定 entitled:false，表单仍正常显示——首套免费，且根本不该发起闸门探测请求", async () => {
    listDwellings.mockResolvedValue([]);
    const fetchSpy = vi.fn(async () => jsonResponse({ entitled: false }));
    vi.stubGlobal("fetch", fetchSpy);
    await renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument());
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /**
   * 修复单 Critical 1（同类）：本页原来也把「探测失败」直接 setEntitled(false)，
   * 于是一次网络抖动就把新增表单换成付费墙——在 BILLING_ENABLED 未设置（默认）的
   * 构建里，服务端本来对任何人都放行，这是在向一个有权限的用户推销。
   */
  it("闸门探测失败：不给付费墙，给「重新确认」入口；已有居所列表不受影响", async () => {
    listDwellings.mockResolvedValue([D1]);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/会员状态暂时确认不了/)).toBeInTheDocument());
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
    expect(screen.getByRole("button", { name: "重新确认" })).toBeInTheDocument();
  });

  it("闸门探测返回 502：同样按「资格未知」处理，不当作「确认非会员」", async () => {
    listDwellings.mockResolvedValue([D1]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    await renderPage();
    await waitFor(() => expect(screen.getByText(/会员状态暂时确认不了/)).toBeInTheDocument());
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
  });

  it("探测失败后点「重新确认」：重新探测，成功放行后新增表单恢复", async () => {
    listDwellings.mockResolvedValue([D1]);
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("network down");
      return jsonResponse({ entitled: true });
    }));
    await renderPage();
    await waitFor(() => expect(screen.getByText(/会员状态暂时确认不了/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "重新确认" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument());
    expect(screen.queryByText(/会员状态暂时确认不了/)).toBeNull();
    expect(calls).toBe(2);
  });
});

/**
 * 修复单 Important 4：本页的闸门探测同样必须把 Supabase 会话 token 发出去——
 * 不发的话，`BILLING_ENABLED=1` 时每个非 Telegram（邮箱 / 匿名 Supabase）会员都会
 * 被服务端当成「未登录 ⇒ 非会员」，新增表单被付费墙挡掉。此前本文件把会话写死成
 * `session: null`，这条链路零断言。
 */
describe("EP-fs-17 会员闸门（Task 10 修复单 Important 4）：探测请求必须带上会话 token", () => {
  it("有 Supabase 会话时：闸门探测 GET 带上 Authorization: Bearer <access_token>", async () => {
    supabaseSession.current = { access_token: "tok-xyz" };
    listDwellings.mockResolvedValue([D1]);
    const fetchSpy = vi.fn(async () => jsonResponse({ entitled: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-xyz");
  });

  it("没有 Supabase 会话时不伪造 Authorization 头（对照组）", async () => {
    supabaseSession.current = null;
    listDwellings.mockResolvedValue([D1]);
    const fetchSpy = vi.fn(async () => jsonResponse({ entitled: true }));
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage();
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});
