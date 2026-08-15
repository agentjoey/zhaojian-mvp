import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, dwellingGua } from "@eamvp/core";
import type { Dwelling } from "@/lib/dwellings";

/**
 * 把 core 的 `adviseObject` 包一层记录入参（**不改行为**，透传真实实现），手法同
 * app/fengshui/__tests__/page.test.tsx 包 `computeFengshui`。
 *
 * 为什么非要看入参、光看 UI 不行：八宅的四吉方要么整组东四、要么整组西四，命宅
 * **同组**时「命卦吉方 ∩ 宅卦吉方」= 四吉方全中，强版与弱版的渲染结果逐字节相同。
 * 于是「页面在不该叠加时叠加了」这种错误，只要它误用的宅卦恰好与命卦同组，任何
 * 只看 DOM 的断言都照绿——已实测：把闸门整个去掉、无居所时硬塞一个 `dwellingGua("N")`
 * （离宅，与本夹具的坎命同组），全部 UI 断言无一变红。看入参才与「同不同组」无关。
 */
const { adviseObjectCalls } = vi.hoisted(() => ({
  adviseObjectCalls: { inputs: [] as { dwellingSectors?: unknown }[] },
}));
vi.mock("@eamvp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@eamvp/core")>();
  return {
    ...actual,
    adviseObject: (
      input: Parameters<typeof actual.adviseObject>[0],
      q: Parameters<typeof actual.adviseObject>[1],
    ) => {
      adviseObjectCalls.inputs.push(input);
      return actual.adviseObject(input, q);
    },
  };
});

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

/**
 * `dwellingsFixture` 用 `vi.hoisted`：本文件每条测试都 `vi.resetModules()` 后动态
 * `import("../page")`，`@/lib/dwellings` 会被重新解析、`vi.mock` 工厂可能重新执行，
 * 产出与测试顶层拿到的**不是同一个** `vi.fn` 实例。直接 `mockResolvedValueOnce` 会
 * 打在一个页面根本不会调用到的旧实例上、测试静默失效（同 app/fengshui/__tests__/
 * page.test.tsx 顶部的说明）。改用工厂内闭包读取的共享可变对象，不受 resetModules 影响。
 */
const { dwellingsFixture } = vi.hoisted(() => ({
  dwellingsFixture: { current: [] as Dwelling[], error: null as unknown, calls: 0 },
}));

vi.mock("@/lib/profiles", () => ({ getActiveProfile: vi.fn(async () => profile) }));
vi.mock("@/lib/dwellings", () => ({
  // 调用次数记在共享的 hoisted 对象上、**不**靠 `vi.mocked(listDwellings)` 去读——
  // 后者读到的可能是 resetModules 之前那个旧 `vi.fn` 实例，页面调用的是另一个，
  // 断言会静默恒真（同本文件顶部 dwellingsFixture 的理由）。已实测：用共享计数器
  // 时「flag 关闭不读居所」这条能被变异撞红，用 vi.mocked 则撞不红。
  listDwellings: vi.fn(async () => {
    dwellingsFixture.calls += 1;
    if (dwellingsFixture.error) throw dwellingsFixture.error;
    return dwellingsFixture.current;
  }),
}));
vi.mock("@/lib/tg/client", () => ({ hasTgSession: () => false, tgGetProfile: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/fengshui/object" }));

/**
 * EP-fs-18：本页新增会员闸门探测，要读 supabase 会话的 access_token 附到探测请求上
 * （TG 会话走 cookie，邮箱/匿名登录靠这个头）。`@/lib/supabase` 的真实实现在没配置
 * NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY 时会抛错，测试环境没配，必须 mock。
 */
const { supabaseSession } = vi.hoisted(() => ({
  supabaseSession: { current: null as { access_token: string } | null },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({ auth: { getSession: vi.fn(async () => ({ data: { session: supabaseSession.current } })) } }),
}));

/**
 * 本页对同一个 URL 发两种请求：`GET /api/fengshui/reading`（会员闸门探测）与
 * `POST /api/fengshui/object`（把已算好的建议润色成句）。全局 fetch 桩必须按
 * method 分流，否则「只认 URL」的裸桩会把探测也答成润色文本，`r.json()` 解析失败
 * → 页面判定「资格未知」→ 一堆强版测试假阴性（同 app/fengshui/__tests__/page.test.tsx
 * 里 methodRouter 的理由）。
 */
function methodRouter(handlers: { GET?: () => Response | Promise<Response>; POST?: () => Response | Promise<Response> }) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "POST") {
      if (handlers.POST) return handlers.POST();
      throw new Error("methodRouter: 未预期的 POST 调用");
    }
    if (handlers.GET) return handlers.GET();
    throw new Error(`methodRouter: 未预期的 ${method} 调用`);
  });
}
const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, ...init });

/**
 * 相冲居所：向东南 → 坐西北 → **乾宅（西四宅）**，四吉方 = 西四方；命主
 * 1990-06-15 男是**坎命（东四命）**，四吉方 = 东四方 —— 两组不重合，交集必空。
 *
 * ⚠️ 之所以刻意挑「相冲」而不是随手一个居所：八宅的四吉方要么整组东四、要么整组
 * 西四，同组时「命卦吉方 ∩ 宅卦吉方」= 四吉方全中，强版与弱版算出的推荐位**逐字节
 * 相同**——用同组居所做夹具，页面传没传 dwellingSectors 在 UI 上根本看不出来，
 * 下面所有强/弱对照全都会退化成恒真断言。异组才让差别（dwellingNote 说明卡）
 * 显形。交集确实为空这件事由 ObjectAdvisorForm.test.tsx 的「夹具自检」实测断言。
 */
const CLASH_DWELLING: Dwelling = {
  id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "SE", memberProfileIds: [],
};
/** core 在交集为空时写进 `dwellingNote` 的说明，其小标题（i18n）。 */
const NOTE_TITLE = "关于这套房子";

/**
 * 与 app/fengshui/__tests__/page.test.tsx 同一个已知陷阱：本页在组件体内直接调用
 * useT()，一旦某条测试 vi.resetModules() 后动态 import 本页，Wrapper 用的
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
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Page />, { wrapper: Wrapper });
  });
  return result;
}

/**
 * 排空「档案 → 居所 → 闸门探测」这条异步链上剩余的微任务，让 state 落定。
 * 建议是在**点击那一刻**用当时手上的 dwellingSectors 算出来的，所以强/弱对照
 * 必须等闸门结论到位后再点，否则测的是竞态而不是逻辑。
 */
async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

function submitDesk() {
  fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
  fireEvent.click(screen.getByText("看看放哪儿好"));
}

/** 探测请求（GET /api/fengshui/reading）的调用次数——POST 润色请求不计入。 */
function probeCalls(spy: ReturnType<typeof methodRouter>): number {
  return spy.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "GET").length;
}

/** 最近一次 `adviseObject` 的入参。没调用过就直接失败，不返回 undefined 让断言空转。 */
function lastAdviseInput(): { dwellingSectors?: unknown } {
  expect(adviseObjectCalls.inputs.length, "adviseObject 应当已被调用（提交按钮点过了）").toBeGreaterThan(0);
  return adviseObjectCalls.inputs[adviseObjectCalls.inputs.length - 1]!;
}

/** 相冲居所对应的宅卦八方——页面理应原样交给 `adviseObject` 的那一份。 */
const CLASH_SECTORS = dwellingGua("SE").sectors;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  adviseObjectCalls.inputs.length = 0;
  dwellingsFixture.current = [];
  dwellingsFixture.calls = 0;
  dwellingsFixture.error = null;
  supabaseSession.current = null;
  vi.stubGlobal(
    "fetch",
    methodRouter({
      GET: () => jsonResponse({ entitled: true }),
      POST: () => new Response("放东边靠墙就好。"),
    }),
  );
});

describe("EP-fs-08 /fengshui/object 页面", () => {
  it("flag 关闭时显示未开启文案，不渲染表单，且不发任何请求（含 EP-fs-18 新增的闸门探测）", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    dwellingsFixture.current = [CLASH_DWELLING]; // 就算数据在那儿也不许碰
    const spy = methodRouter({ GET: () => jsonResponse({ entitled: true }), POST: () => new Response("好的。") });
    vi.stubGlobal("fetch", spy);

    await renderPage();
    await settle();
    expect(screen.getByText("「境」尚未开启。")).toBeInTheDocument();
    expect(screen.queryByLabelText("品类")).toBeNull();
    // 整个「境」在 flag 关闭时必须完全静默：EP-fs-18 新增的闸门探测是本页第一个
    // 在**渲染之外**发起的网络请求，很容易漏掉 flag 判断而在关闭态照样打出去。
    expect(spy).not.toHaveBeenCalled();
    expect(dwellingsFixture.calls).toBe(0);
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

/**
 * EP-fs-18 强版接线。**付费边界**：免费 = Layer 0 本命八方 + 弱版物件顾问；
 * 会员 = 住宅实盘 / 分级化解 / 合看 / 多居所 + **强版**物件顾问（叠加宅卦八方）。
 * 本页不设付费墙——弱版本身就是一份完整可用的产品，「确认是会员且确实有朝向已知的
 * 居所」才升级成强版，其余一切情形（非会员 / 没居所 / 朝向不确定 / 探测失败 /
 * 探测在途）一律弱版，也就是本页在波1 的既有行为。
 */
describe("EP-fs-18 /fengshui/object 强版接线（会员 + 居所）", () => {
  it("已确认会员 + 有朝向已知的居所 → 强版：宅八方叠加生效，渲染 dwellingNote 说明", async () => {
    dwellingsFixture.current = [CLASH_DWELLING];
    const spy = methodRouter({ GET: () => jsonResponse({ entitled: true }), POST: () => new Response("好的。") });
    vi.stubGlobal("fetch", spy);

    await renderPage();
    await waitFor(() => expect(probeCalls(spy)).toBe(1));
    await settle();
    submitDesk();

    await waitFor(() => expect(screen.getByText(NOTE_TITLE)).toBeInTheDocument());
    // 正文来自 core（`adviseObject` 的 dwellingNote），不是页面自编的文案。
    expect(screen.getByText(/吉方与你的命卦吉方不重合/)).toBeInTheDocument();
    // 「不是给空推荐」——交集为空时 core 退回命卦吉方，推荐区块照常有内容。
    expect(screen.getByText("推荐方位")).toBeInTheDocument();
    // 交下去的确实是**这套居所**的宅卦八方（乾宅），而不是随便一份 Record。
    expect(lastAdviseInput().dwellingSectors).toEqual(CLASH_SECTORS);
  });

  it("服务端判定非会员（entitled:false）+ 有居所 → 弱版：不叠加宅八方", async () => {
    dwellingsFixture.current = [CLASH_DWELLING];
    const spy = methodRouter({ GET: () => jsonResponse({ entitled: false }), POST: () => new Response("好的。") });
    vi.stubGlobal("fetch", spy);

    await renderPage();
    // 页面**确实问过**服务端（不是压根没探测所以碰巧没升级），并遵从了「否」。
    await waitFor(() => expect(probeCalls(spy)).toBe(1));
    await settle();
    submitDesk();

    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    // 同一份居所夹具在上一条里会渲染出这段说明——所以这条缺席断言是真的能红的。
    expect(screen.queryByText(NOTE_TITLE)).toBeNull();
    // 与「同不同组」无关的硬证据：宅八方压根没交给 adviseObject。
    expect(lastAdviseInput().dwellingSectors).toBeUndefined();
    // 不设付费墙：弱版就是完整产品，不该出现任何「升级会员」的推销。
    expect(screen.queryByText("会员")).toBeNull();
  });

  it("无居所 → 弱版，行为与波1 一致；且根本不发闸门探测请求", async () => {
    const spy = methodRouter({ POST: () => new Response("好的。") }); // 没有 GET handler：探测一旦发生就抛错
    vi.stubGlobal("fetch", spy);

    await renderPage();
    await waitFor(() => expect(screen.getByLabelText("品类")).toBeInTheDocument());
    await settle();
    submitDesk();

    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.queryByText(NOTE_TITLE)).toBeNull();
    // ⚠️ 上面那句缺席断言**不足以**守住「无居所时不叠加」：页面若在没有居所时硬编
    //    一个宅卦兜底，只要它恰好与命卦同组（比如 `dwellingGua("N")` 之于坎命），
    //    渲染结果与弱版逐字节相同，缺席断言照绿。已实测。真正守住它的是下面这句。
    expect(lastAdviseInput().dwellingSectors).toBeUndefined();
    // 没有 Layer 1 候选时不该为一个不影响任何渲染结果的信号多发一次网络往返。
    expect(probeCalls(spy)).toBe(0);
  });

  it("居所朝向为「不确定」（facing: null）→ 弱版，且不发探测请求", async () => {
    dwellingsFixture.current = [{ ...CLASH_DWELLING, facing: null }];
    const spy = methodRouter({ POST: () => new Response("好的。") });
    vi.stubGlobal("fetch", spy);

    await renderPage();
    await waitFor(() => expect(screen.getByLabelText("品类")).toBeInTheDocument());
    await settle();
    submitDesk();

    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.queryByText(NOTE_TITLE)).toBeNull();
    // 「不确定」就不猜——不能拿一个默认朝向替用户编一个宅卦出来（同 core 里
    // DwellingInput.facing 不许为 null 的约定，见 packages/core/.../dwelling.ts）。
    expect(lastAdviseInput().dwellingSectors).toBeUndefined();
    expect(probeCalls(spy)).toBe(0);
  });

  it("探测失败（非 2xx）→ 弱版 + 说明与重试入口；重试成功后升级为强版", async () => {
    dwellingsFixture.current = [CLASH_DWELLING];
    let failNext = true;
    const spy = methodRouter({
      GET: () => (failNext ? new Response("boom", { status: 502 }) : jsonResponse({ entitled: true })),
      POST: () => new Response("好的。"),
    });
    vi.stubGlobal("fetch", spy);

    await renderPage();
    // 「暂时不知道」≠「确认不是会员」：给说明 + 重新确认入口，而不是静默降级。
    await waitFor(() =>
      expect(screen.getByText("会员状态暂时确认不了，下面先只按你的本命方位给建议——不代表你没有权限。")).toBeInTheDocument(),
    );
    submitDesk();
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.queryByText(NOTE_TITLE)).toBeNull();
    expect(lastAdviseInput().dwellingSectors).toBeUndefined();

    // 重试：失败态可以被用户自己救回来，不必刷新整页。
    failNext = false;
    fireEvent.click(screen.getByText("重新确认"));
    await waitFor(() => expect(probeCalls(spy)).toBe(2));
    await settle();
    await waitFor(() => expect(screen.queryByText("会员状态暂时确认不了，下面先只按你的本命方位给建议——不代表你没有权限。")).toBeNull());
    submitDesk();
    await waitFor(() => expect(screen.getByText(NOTE_TITLE)).toBeInTheDocument());
    expect(lastAdviseInput().dwellingSectors).toEqual(CLASH_SECTORS);
  });

  it("探测返回 200 但 body 不含 entitled 布尔 → 按「未知」处理（弱版 + 提示），不当成「不是会员」", async () => {
    dwellingsFixture.current = [CLASH_DWELLING];
    const spy = methodRouter({ GET: () => jsonResponse({ oops: 1 }), POST: () => new Response("好的。") });
    vi.stubGlobal("fetch", spy);

    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("会员状态暂时确认不了，下面先只按你的本命方位给建议——不代表你没有权限。")).toBeInTheDocument(),
    );
    submitDesk();
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.queryByText(NOTE_TITLE)).toBeNull();
    expect(lastAdviseInput().dwellingSectors).toBeUndefined();
  });

  it("非会员被判定 entitled:false 时不显示「未知」提示——那是两件不同的事", async () => {
    dwellingsFixture.current = [CLASH_DWELLING];
    const spy = methodRouter({ GET: () => jsonResponse({ entitled: false }), POST: () => new Response("好的。") });
    vi.stubGlobal("fetch", spy);

    await renderPage();
    await waitFor(() => expect(probeCalls(spy)).toBe(1));
    await settle();
    // 服务端明确答了「否」，不是「不知道」——不能给出「暂时确认不了」这种与事实不符的解释。
    expect(screen.queryByText("会员状态暂时确认不了，下面先只按你的本命方位给建议——不代表你没有权限。")).toBeNull();
    expect(screen.queryByText("重新确认")).toBeNull();
  });

  it("探测请求带上 Authorization（邮箱/匿名登录靠它被识别为会员）", async () => {
    dwellingsFixture.current = [CLASH_DWELLING];
    supabaseSession.current = { access_token: "tok-abc" };
    const spy = methodRouter({ GET: () => jsonResponse({ entitled: true }), POST: () => new Response("好的。") });
    vi.stubGlobal("fetch", spy);

    await renderPage();
    await waitFor(() => expect(probeCalls(spy)).toBe(1));
    const [url, init] = spy.mock.calls.find(([, i]) => (i?.method ?? "GET") === "GET")!;
    expect(url).toBe("/api/fengshui/reading");
    expect(init!.headers).toMatchObject({ Authorization: "Bearer tok-abc" });
  });

  it("居所读取失败 → 弱版（不崩、不发探测）", async () => {
    dwellingsFixture.error = new Error("supabase 抖动");
    const spy = methodRouter({ POST: () => new Response("好的。") });
    vi.stubGlobal("fetch", spy);

    await renderPage();
    await waitFor(() => expect(screen.getByLabelText("品类")).toBeInTheDocument());
    await settle();
    submitDesk();

    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.queryByText(NOTE_TITLE)).toBeNull();
    expect(lastAdviseInput().dwellingSectors).toBeUndefined();
    expect(probeCalls(spy)).toBe(0);
  });
});
