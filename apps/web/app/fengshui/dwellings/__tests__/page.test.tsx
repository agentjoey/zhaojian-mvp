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
 * `@/lib/supabase` 的真实实现在没配 NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY 时会抛错
 * （同 lib/__tests__/dwellings.test.ts、fengshui/__tests__/page.test.tsx 踩过的同一个
 * 坑），必须 mock 掉。
 *
 * 最终评审 I2 之后**本页自己不再 import 它**（多居所闸门连同探测一并撤除），但
 * `DwellingForm`（本页下半部分永远渲染）会 import——它要为同住人选择器的合看闸门
 * （最终评审 I3）读会话 token。所以这个 mock 仍然是必需的，只是服务对象换了。
 * 会话内容保持可按测试改写的共享可变量（`vi.hoisted`，理由同
 * fengshui/__tests__/page.test.tsx 里的同名夹具）。
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

/** 会员闸门探测响应；route 返回 JSON `{ entitled }`。本页自己不再探测（I2），
 *  但夹具保留：多条测试要断言「即使端点会答 entitled:false，本页也不受影响」。 */
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
  // 默认 entitled:true。本页自己已不发请求（I2），这个桩留着是给 `DwellingForm`
  // 内部那条合看闸门探测兜底——本文件的 listProfiles 只返回主档案自己，选择器不
  // 渲染、探测也不会发起，但桩在这里意味着即使将来夹具变了也不会打到真 fetch。
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
 * 最终评审 I2：**撤除**「保存第 2 套居所」的会员闸门。
 *
 * Task 10 曾把它挡在 `<Paywall reason="limit" />` 后面（非会员：「已达免费版上限，
 * 升级会员后可继续保存」）。撤除的理由不是"闸门实现得不对"，而是它挡住的东西
 * **没有任何可观察产出**：`../page.tsx` 与 `../object/page.tsx` 都硬编码
 * `dwellings[0]`，居所切换器未实现，第 2 套居所不被任何东西读取，只作为管理列表里
 * 的一行存在。升级会员换来的就是那一行——为一个不产出任何东西的能力收费。
 *
 * 所以本 describe 的断言方向整个反了过来：从「非会员被挡住」变成「非会员不被挡住」。
 * 变异对照（实跑过）：把 `<Paywall reason="limit" />` 分支加回 page.tsx，下面第一条
 * 与第二条当场变红。
 *
 * ⚠️ 撤的只是多居所这一条。Layer 1 本身的闸门（宅盘 / 合看 / 分级化解）有真实可观察
 * 差异，仍然生效——合看那条现在贴在 `../DwellingForm.tsx` 的同住人选择器上
 * （最终评审 I3），由 `fengshui/__tests__/DwellingForm.test.tsx` 覆盖。
 */
describe("最终评审 I2：新增居所不再受会员闸门限制（挡住的东西本来就没有产出）", () => {
  it("已有 1 个居所且服务端会判定为非会员：新增表单照常显示，没有付费墙", async () => {
    listDwellings.mockResolvedValue([D1]);
    // 即使端点摆明了答 entitled:false，本页也不该去问、更不该据此挡人。
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ entitled: false })));
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument());
    // 付费墙的标题在本页任何位置都不该出现（`queryAllByText` 而非 `queryByText`：
    // 后者在多次匹配时抛 multiple-match，而不是干净地失败）
    expect(screen.queryAllByText("升级会员，解锁无限")).toHaveLength(0);
    expect(screen.queryAllByText(/已达免费版上限/)).toHaveLength(0);
  });

  it("已有 2 个居所（早就超出旧的「免费 1 套」上限）：第 3 套照样能新增", async () => {
    listDwellings.mockResolvedValue([D1, D2]);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ entitled: false })));
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument());
    expect(screen.queryAllByText("升级会员，解锁无限")).toHaveLength(0);
  });

  it("没有居所时同样照常显示表单（首套本来就免费，行为不变）", async () => {
    listDwellings.mockResolvedValue([]);
    await renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument());
    expect(screen.queryAllByText("升级会员，解锁无限")).toHaveLength(0);
  });

  /** 把所有在途 promise/effect 排空，让「之后还会不会再冒出点什么」变成确定性的。 */
  async function drainEffects(rounds = 3) {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  }

  /**
   * I2 要求 2：闸门撤了，为它服务的权益探测也要一并撤——不留下没人使用的探测请求。
   *
   * 本文件的 `listProfiles` 只返回主档案自己，`DwellingForm` 的同住人选择器因此
   * 不渲染、也不会发起它自己那条（I3 的合看）探测。于是本页在这套夹具下的正确
   * 网络行为是**一次请求都不发**。这条同时锁住两件事：闸门探测确实没了，且
   * DwellingForm 的探测确实按「有候选人才探」的守卫工作。
   */
  it("本页不再发起任何权益探测请求（闸门撤了，探测也一并撤）", async () => {
    listDwellings.mockResolvedValue([D1, D2]);
    const fetchSpy = vi.fn(async () => jsonResponse({ entitled: false }));
    vi.stubGlobal("fetch", fetchSpy);
    await renderPage();
    await waitFor(() => expect(screen.getByText("家A")).toBeInTheDocument());
    await drainEffects();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  /**
   * 探测撤除后连带消失的那些中间态，不能悄悄留下残骸：本页曾有「探测在途 →
   * 加载中…」「探测失败 → 会员状态暂时确认不了 + 重新确认」两条分支。它们现在
   * 一条都不该出现——哪怕端点永远不落定（那正是当年"加载中…"分支的触发条件）。
   */
  it("端点永不落定时，新增区域也不会退回加载态/「重新确认」（那些分支已随探测一并删除）", async () => {
    listDwellings.mockResolvedValue([D1]);
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    await renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument());
    await drainEffects();

    expect(screen.queryAllByText("加载中…")).toHaveLength(0);
    expect(screen.queryAllByText(/会员状态暂时确认不了/)).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "重新确认" })).toHaveLength(0);
  });
});
