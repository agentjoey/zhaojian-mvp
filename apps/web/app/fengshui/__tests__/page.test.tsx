import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within, act } from "@testing-library/react";
import {
  BirthInputSchema, computeUnifiedChart, computeFengshui, directionsFor, FENGSHUI_ENGINE_VERSION,
  DIRECTION_LABEL,
} from "@eamvp/core";
import { fengshuiFingerprint, type FengshuiSections } from "@/lib/fengshui-report";
import type { Dwelling } from "@/lib/dwellings";
// 最终评审 I1：同住人上限的**单一事实源**，与 api/fengshui/reading/route.ts 的
// `z.array(...).max()` 是同一个常量。测试从这里取值，而不是再写死一个 8。
import { MAX_COHABITANTS } from "@/lib/fengshui-limits";
// 修复单 Minor 1：付费墙文案断言从 catalog 取值，与实现绑死——写死字面量的那条反向
// 断言在 `47e9faa` 改文案后已经悄悄变成过一次恒真（断言的字符串在代码库任何角落都
// 不存在了，于是它抓不到唯一要防的「改回 reason="limit"」回归）。同一次编辑不该能
// 再造出恒真：文案在哪儿改，断言就跟到哪儿。
import { zh } from "@/lib/i18n/messages/zh";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };
// 与 page.tsx 内部完全相同的计算（birth + chart 一致），用来独立算出 fs.remedies 的真实
// 顺序与内容，而不是靠猜测某条化解「恒为第一条」——那类假设已经在最终评审 Blocking 2
// 的排查中被证明不可靠（sortRemedies 的实际结果并不是本文件旧注释所声称的那样）。
const fs = computeFengshui({ birth, chart: profile.chart });

/**
 * 合看 chips（EP-fs-15）用的同住人档案。1984-06-15 男 = 兑7（西四命），与主档案
 * 1990-06-15 男 = 坎1（东四命）刻意取一东一西——八宅的四吉方以「组」为单位整体
 * 互斥（同组必然共享全部四吉方，异组必然全无交集，见 packages/core/src/fengshui/
 * cohabitants.ts 顶部注释与 fengshui-cohabitants.test.ts），所以任一原本对主档案
 * 吉的方位，切到这位同住人后必然变凶。着色断言因此是结构性保证，不依赖巧合样本。
 */
const cohabBirth = BirthInputSchema.parse({ date: "1984-06-15", time: "10:00", gender: "male", trueSolarTime: false });
const cohabProfile = {
  id: "p2", nickname: "阿乙", birthInput: cohabBirth, chart: computeUnifiedChart(cohabBirth), createdAt: "", reading: null,
};

/** 向南 → 坐北 → 坎宅（与主档案命卦「坎」同名纯属巧合，两套八方各自独立标注，互不影响）。 */
const dwellingL1 = (memberProfileIds: string[] = []): Dwelling => ({
  id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S", memberProfileIds,
});
const DWELLING_UNKNOWN_FACING: Dwelling = {
  id: "d1", name: "家", kind: "home", tenancy: "rent", facing: null, memberProfileIds: [],
};

/**
 * 三分节报告桩数据（Task 14 复审后：route 契约改为 JSON，客户端直接消费已切好的
 * `sections`，不再自己从 markdown 里找 `## ` 分节）。"甲"/"乙"/"丙" 是仅在叙述里
 * 出现的独有标记字符，用来断言「叙述本体是否被渲染」。
 */
const SECTIONS = { situation: "甲", youAndSpace: "乙", actions: "丙" };

/**
 * Task 7（EP-fs-16）：波1 的 localStorage 缓存键（fengshuiCacheKey）已废弃，报告改按
 * 指纹持久化到服务端 `fengshui_reports`。默认（无居所）时页面内部按 Layer 0 算指纹
 * （`dwelling: null, memberProfileIds: []`）——这里用同样的入参独立调用真实的
 * `fengshuiFingerprint`（纯函数，未 mock）算出预期指纹，与 page.tsx 内部实际使用的
 * 值保持一致。
 */
const fpFor = (locale: string, engineVersion: string = FENGSHUI_ENGINE_VERSION) =>
  fengshuiFingerprint({ profileId: "p1", locale, engineVersion, dwelling: null, memberProfileIds: [] });
const FP_ZH = fpFor("zh");
const FP_EN = fpFor("en");

/** route 现在返回 JSON（`{ sections, degraded }`），而不是纯 markdown 文本 + 自定义响应头。 */
function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

/**
 * Task 10（EP-fs-17 会员闸门）：page.tsx 现在会对同一个 URL
 * （/api/fengshui/reading）发两种请求——GET（闸门探测，只在存在朝向已知的居所时
 * 才发起）与 POST（叙述生成，既有行为）。全局 `fetch` 桩必须按 method 分流，
 * 否则「只匹配 URL、不管 method」的旧式桩会把 GET 也答成叙述 JSON（缺 entitled
 * 字段 → 被判定未订阅 → 大量既有 Layer 1 测试假阳性失败），或者把 POST 也答成
 * entitled 探测响应（叙述内容对不上）。本文件其余测试统一通过它构造 fetch 桩，
 * 不再直接摆一个不区分 method 的裸 `vi.fn`。
 */
function methodRouter(handlers: {
  GET?: () => Response | Promise<Response>;
  POST?: () => Response | Promise<Response>;
}) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "POST") {
      if (handlers.POST) return handlers.POST();
      throw new Error(`methodRouter: 未预期的 POST 调用（未提供 POST handler）`);
    }
    if (handlers.GET) return handlers.GET();
    throw new Error(`methodRouter: 未预期的 ${method} 调用（未提供 GET handler）`);
  });
}

/**
 * `dwellingsFixture`/`profilesById` 用 `vi.hoisted` 声明（同下面 `reportStore` 的理由）：
 * 让被提升到文件顶部的 `vi.mock` 工厂能安全闭包到它们。每条测试在 `beforeEach` 里
 * 重置，需要 Layer 1 的测试再显式塞入居所/同住人档案。
 *
 * `dwellingsFixture.error`（复审必修2）：模拟 `listDwellings()` 失败。**不用**
 * `vi.mocked(listDwellings).mockRejectedValueOnce(...)` 这种直接摆弄 mock 实例的写法——
 * 本文件的 `renderPage()` 每次都 `vi.resetModules()` 后动态 `import("../page")`，
 * `@/lib/dwellings` 会被重新解析，`vi.mock` 工厂可能重新执行、产出与测试文件顶层
 * 静态 import 到的**不是同一个** `vi.fn()` 实例，届时 `mockRejectedValueOnce` 覆盖的
 * 是一个 page.tsx 内部根本不会调用到的旧实例，测试会静默失效。改用工厂内闭包读取的
 * 共享 `vi.hoisted` 对象（`dwellingsFixture` 本身，同 `.current` 的既有用法）——
 * 无论工厂被重新调用多少次，读到的都是同一份可变状态，不受 resetModules 影响。
 */
const { dwellingsFixture, profilesById } = vi.hoisted(() => ({
  dwellingsFixture: { current: [] as Dwelling[], error: null as unknown },
  profilesById: new Map<string, unknown>(),
}));

/**
 * 修复单 Minor 4：Important 2 的要求本身是「非会员的浏览器里根本不存在付费派生内容」，
 * 而此前**全部**断言测的都是它的 UI 投影（宅八方没渲染、宅层化解没渲染…）。只回退
 * `fs` memo 会把 `f.layer` 翻成 1、撞红那些 UI 断言，但**协调一致地**退回原设计
 * （裸 `dwellingInput` 算 `fs` + JSX 里单独判 `entitled`）能全绿通过——付费派生内容
 * （`f.dwelling.sectors` / `matchWithPerson` / 宅层化解）就这么重新回到非会员的
 * 客户端 state 里，只是没渲染出来。
 *
 * 这里把 core 的 `computeFengshui` 包一层记录入参（**不改行为**，直接透传真实实现），
 * 让「被挡时它从没收到过 dwelling/cohabitants」成为一条可断言的事实。
 * 记录器用 `vi.hoisted`：`renderPage()` 每次 `resetModules()` + 动态 `import("../page")`，
 * mock 工厂会重新执行，闭包到同一份可变对象才能读到页面真正调用的那些入参
 * （与 `dwellingsFixture` / `supabaseSession` 同一理由）。
 * 本文件顶层为算 `fs`/`l1` 也会调用它，那两次发生在收集阶段，`beforeEach` 里清空即可。
 */
const { computeFengshuiCalls } = vi.hoisted(() => ({
  computeFengshuiCalls: { args: [] as { dwelling?: unknown; cohabitants?: unknown }[] },
}));
vi.mock("@eamvp/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@eamvp/core")>();
  return {
    ...actual,
    computeFengshui: (input: Parameters<typeof actual.computeFengshui>[0]) => {
      computeFengshuiCalls.args.push(input);
      return actual.computeFengshui(input);
    },
  };
});

vi.mock("@/lib/profiles", () => ({
  getActiveProfile: vi.fn(async () => profile),
  getProfile: vi.fn(async (id: string) => profilesById.get(id) ?? null),
}));
vi.mock("@/lib/dwellings", () => ({
  listDwellings: vi.fn(async () => {
    if (dwellingsFixture.error) throw dwellingsFixture.error;
    return dwellingsFixture.current;
  }),
}));
vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => false,
  // EP-fs-tg：可变——文件末尾「TG 会话」describe 把它翻成 true 断言原生分段 Tab。
  isTelegram: () => tgEnv.inTg,
  tgGetProfile: vi.fn(),
  tgListProfiles: vi.fn(async () => []),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/fengshui" }));

/**
 * Task 10（EP-fs-17 会员闸门）：page.tsx 新增直接 import `@/lib/supabase`（读会话
 * access_token，附到 /api/fengshui/reading 的请求头上，供服务端识别非 TG 用户）。
 * `@/lib/supabase` 的真实实现会在没配置 NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY 时抛错
 * （见 lib/__tests__/dwellings.test.ts 顶部注释，同一个坑），测试环境没配这两个
 * env，必须 mock 掉。默认 `session: null`（等价于「未登录/本地匿名」）——绝大多数
 * 测试不关心「服务端具体怎么识别身份」（那由 route.test.ts 独立覆盖）。
 *
 * 修复单 Important 4：会话内容改成可按测试改写的共享可变量（`vi.hoisted`，理由同
 * `dwellingsFixture`：renderPage() 每次 resetModules + 动态 import，mock 工厂可能
 * 重新执行，直接摆弄 mock 实例会打到一个 page.tsx 根本不会调用到的旧实例）。
 * 原来写死 `session: null` 意味着 `fengshuiAuthHeader()` 在**每一条**测试里都返回
 * `{}`，于是「客户端到底发不发 Authorization」全程零断言——把 POST 与两个探测请求
 * 的 Authorization 头整个删掉，全套测试照样绿，而 BILLING_ENABLED=1 时每个非
 * Telegram（邮箱/匿名 Supabase）会员都会被静默 402 并挡在付费墙外。
 */
const { tgEnv } = vi.hoisted(() => ({ tgEnv: { inTg: false } }));
const { supabaseSession } = vi.hoisted(() => ({
  supabaseSession: { current: null as { access_token: string } | null },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({ auth: { getSession: vi.fn(async () => ({ data: { session: supabaseSession.current } })) } }),
}));

/**
 * `@/lib/fengshui-report` 的服务端读写（`readFengshuiReport`/`saveFengshuiReport`）本
 * 该打 Supabase，测试里用一个模块级 Map 顶替「服务端存储」。`reportStore` 用
 * `vi.hoisted` 声明，是为了让下面 `vi.mock` 工厂（会被提升到本文件所有 import 之前
 * 执行）能安全闭包到它——工厂内部只在 `vi.fn` 的回调里读写 `reportStore`，真正调用
 * 发生在测试运行时（模块早已加载完毕），不是工厂函数体自身执行的那一刻，所以不存在
 * 暂时性死区问题；用 `vi.hoisted` 是让这份保证显式、不依赖记住这套时序细节。
 * `fengshuiFingerprint` 保留真实实现（未 mock）：`...actual` 透传，只覆盖两个
 * 网络函数——这样 `FP_ZH`/`FP_EN` 与 page.tsx 内部算出来的指纹必然一致。
 */
const { reportStore } = vi.hoisted(() => ({ reportStore: new Map<string, FengshuiSections>() }));

vi.mock("@/lib/fengshui-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fengshui-report")>();
  return {
    ...actual,
    readFengshuiReport: vi.fn(async (fp: string) => reportStore.get(fp) ?? null),
    saveFengshuiReport: vi.fn(async (args: { fingerprint: string; sections: FengshuiSections }) => {
      reportStore.set(args.fingerprint, args.sections);
    }),
  };
});

/**
 * 已知陷阱：`page.tsx` 组件体内直接调用 `useT()`/`useLocale()`。一旦某条测试
 * `vi.resetModules()` 后动态 `import("../page")`，而 Wrapper 用的 `I18nProvider`
 * 仍是文件顶层的静态 import，二者就落在两份不同的模块图上、各自持有不同的
 * `I18nContext` 实例——`useContext` 按引用比对找不到匹配的 Provider，抛出
 * "useT must be used within <I18nProvider>"。`AppShell.test.tsx` 已踩过同一个坑
 * （见 apps/web/components/__tests__/AppShell.test.tsx 顶部注释）。
 * 这里统一用 `renderPage()`：每次渲染都把 `Page` 与 `I18nProvider` 从同一次
 * 动态 import 里取出，并在 `beforeEach` 里无条件 `resetModules()`，
 * 避免依赖测试书写顺序（谁调没调 resetModules）来保证正确性。
 *
 * `render()` 包一层 `await act(async () => {...})`（而不是直接 `return render(...)`）
 * 是 Task 9 排查 act() 警告后加的：page.tsx 挂载时的第一个 effect
 * （`getActiveProfile().then(setProfile)`）通过 `vi.fn(async () => …)` mock 返回，
 * 其 `.then` 回调落在一次真实的微任务里。`renderPage()` 本身因为要 `await
 * import(...)` 两次，`render()` 真正执行时机相对测试代码已经过了若干微任务——
 * 用 React 关注 act 环境的说法，`render()` 的同步 act 包裹在它返回时就"关闭"了，
 * 而 `setProfile` 的 `.then` 回调有时会恰好落在"`render()` 已返回、下一行
 * `waitFor(...)` 尚未开始轮询"这个窗口期触发，从而在 act 作用域之外调用
 * setState。用 `await act(async () => { render(...) })` 让 act 显式排空这一批
 * 微任务后再返回，消除这个时序竞争——已实测两种写法在同一份夹具下的差异
 * （加这层包裹前 22 条用例里 19 条会报 "not wrapped in act"，加之后 0 条）。
 */
async function renderPage(locale: "zh" | "en" = "zh") {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider locale={locale}>{children}</I18nProvider>;
  }
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Page />, { wrapper: Wrapper });
  });
  return result;
}

/**
 * 评审后续 #6：situation/youAndSpace 长文默认折叠（条件挂载，不是 CSS 隐藏），
 * 点「展开完整解读」才会真的出现在 DOM 里。凡是要断言这段内容的既有测试都要
 * 先调这个 helper——这不是削弱断言，折叠态与展开态背后是同一份数据/同一条
 * fetch/缓存/degraded 逻辑，测试原本要守的东西一个没变，只是「默认可见」
 * 变成了「点一下才可见」。
 */
function expandNarrative() {
  fireEvent.click(screen.getByText("展开完整解读 →"));
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  localStorage.clear();
  // 首揭仪式（feat/fengshui-ui）：默认抑制定场，避免每条测试都被 2.1s 过场打扰；
  // 专门的「首揭仪式」describe 会自己 removeItem。
  sessionStorage.setItem("zj.fsReveal.p1", "1");
  reportStore.clear();
  dwellingsFixture.current = [];
  dwellingsFixture.error = null;
  supabaseSession.current = null;
  tgEnv.inTg = false;
  computeFengshuiCalls.args.length = 0;
  profilesById.clear();
  profilesById.set("p2", cohabProfile);
  // 默认：entitled:true（对应「未开闸」或「已是会员」——page.tsx 分不清、也不需要
  // 分清这两种；哪种具体情形由本文件末尾「会员闸门」describe 块专门覆盖）。
  // 这保证了本文件其余（Task 10 之前就存在的）Layer 1 测试无需逐个改动。
  vi.stubGlobal(
    "fetch",
    methodRouter({
      GET: () => jsonResponse({ entitled: true }),
      POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
    }),
  );
});

describe("EP-fs-07 /fengshui Layer 0", () => {
  it("渲染命卦、八方盘、三分节叙述标题；切到「化解」显示化解清单", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    // 未降级的正常路径下，叙述本体（situation/youAndSpace）应当在展开后照常渲染
    // 在默认「盘」tab 上（与 degraded 测试「展开后 queryByText("甲") 仍为 null」
    // 形成对照）。
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    expandNarrative();
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
    expect(screen.getByText("乙")).toBeInTheDocument();
    // 复审必修1核心回归：两个 H2 标题必须走 i18n 渲染成真正的标题元素，
    // 绝不能把 "## 形势" 这种字面 markdown 语法原样打印到页面上。
    expect(screen.getByText("形势")).toBeInTheDocument();
    expect(screen.getByText("境与你")).toBeInTheDocument();
    expect(screen.queryByText(/##/)).toBeNull();
    // 叙述分节标题不得借用描述确定性区块的键（八方吉凶 / 宜用色与材），二者语义不同
    expect(screen.queryByText("八方吉凶")).toBeNull();
    expect(screen.queryByText("宜用色与材")).toBeNull();

    // Task 9（EP-fs-15）：化解清单 + 叙述第三节移到「化解」tab，默认盘 tab 不可见。
    expect(screen.queryByText("可做的事")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    expect(screen.getByText("可做的事")).toBeInTheDocument();
    expect(screen.getByText("丙")).toBeInTheDocument();
    for (const r of fs.remedies) {
      expect(screen.getByText(r.action)).toBeInTheDocument();
    }
  });

  it("LLM 失败时仍渲染盘与化解，并显示降级提示", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    await renderPage();
    // 等失败提示本身（真正依赖 fetch reject → setFailed 落定），而不是拿盘图当代理——
    // 盘图不依赖这次 fetch、在 fetch 的 .catch 跑完前就已经渲染出来，两者不是同一时刻发生，
    // 拿盘图当 waitFor 目标会让下面这句偶发地抢在 setFailed 生效前执行（本次改造前就已实测翻车一次）。
    await waitFor(() => expect(screen.getByText(/叙述暂时生成不出来/)).toBeInTheDocument());
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    expect(screen.getByText("可做的事")).toBeInTheDocument();
    // 失败提示在切到「化解」tab 后仍然可见——两个 tab 各自独立渲染同一份 failed 状态。
    expect(screen.getByText(/叙述暂时生成不出来/)).toBeInTheDocument();
  });

  it("flag 关闭时显示未开启文案，不渲染盘，也不渲染 tabs（复审 Minor）", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    await renderPage();
    expect(screen.getByText("「境」尚未开启。")).toBeInTheDocument();
    expect(screen.queryByLabelText("八方吉凶盘")).toBeNull();
    // 只查盘图挡不住「把 flag 检查下移到盘图渲染处、tabs 本身仍然渲染」这种改法——
    // tabs（盘/化解/添置）也必须一并不存在。
    expect(screen.queryByRole("button", { name: "盘" })).toBeNull();
    expect(screen.queryByRole("button", { name: "化解" })).toBeNull();
    expect(screen.queryByRole("button", { name: "添置" })).toBeNull();
  });
});

describe("EP-fs-15 Layer 1 与 Tab", () => {
  it("有居所时渲染宅卦与宅八方，且与本命八方分开标注", async () => {
    dwellingsFixture.current = [dwellingL1()];
    await renderPage();
    await waitFor(() => expect(screen.getByText("房屋八方")).toBeInTheDocument());
    expect(screen.getByText("本命八方")).toBeInTheDocument();
    // 宅卦名可见：向南 → 坐北 → 坎宅
    expect(screen.getByText("坎宅")).toBeInTheDocument();
    // 两个盘各自独立的无障碍标签，证明确实是两张分开的盘而非同一张复用
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    expect(screen.getByLabelText("房屋八方吉凶盘")).toBeInTheDocument();
  });

  it("Tab 切到「化解」显示化解清单，切到「添置」显示物件顾问入口；三个 tab 内容互斥", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument());

    // 默认「盘」tab：另外两个 tab 的内容不可见
    expect(screen.queryByText("可做的事")).toBeNull();
    expect(screen.queryByText("我想添置…")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    expect(screen.getByText("可做的事")).toBeInTheDocument();
    expect(fs.remedies.length).toBeGreaterThan(0);
    for (const r of fs.remedies) expect(screen.getByText(r.action)).toBeInTheDocument();
    // 「盘」「添置」内容此时不可见
    expect(screen.queryByLabelText("八方吉凶盘")).toBeNull();
    expect(screen.queryByText("我想添置…")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "添置" }));
    expect(screen.getByText("我想添置…")).toBeInTheDocument();
    // 「盘」「化解」内容此时不可见
    expect(screen.queryByLabelText("八方吉凶盘")).toBeNull();
    expect(screen.queryByText("可做的事")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "盘" }));
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
  });

  it("合看 chips：切换同住人，八方盘的吉凶着色随之改变", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    await renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "阿乙" })).toBeInTheDocument());

    // 独立核实（不手抄字面量）：北方位对坎(主档案)必吉，对兑(阿乙)必凶——
    // 这不是巧合样本，而是八宅「四吉方按组整体互斥」的结构性结论（见文件顶部注释）。
    const mainN = directionsFor("坎").N;
    const cohabN = directionsFor("兑").N;
    expect(mainN.auspicious).toBe(true);
    expect(cohabN.auspicious).toBe(false);

    // 断言的是「本命八方」盘（唯一带这个无障碍标签的盘），而不是 chip 是否存在/被点击。
    const wheelBefore = screen.getByLabelText("八方吉凶盘");
    expect(within(wheelBefore).getByLabelText(/^北：/).getAttribute("aria-label")).toMatch(/吉/);

    fireEvent.click(screen.getByRole("button", { name: "阿乙" }));

    await waitFor(() => {
      const wheelAfter = screen.getByLabelText("八方吉凶盘");
      expect(within(wheelAfter).getByLabelText(/^北：/).getAttribute("aria-label")).toMatch(/凶/);
    });

    // 切回「我」应当变回吉——证明切换是双向、可逆的数据绑定，不是单次副作用。
    fireEvent.click(screen.getByRole("button", { name: "我" }));
    await waitFor(() => {
      const wheelBack = screen.getByLabelText("八方吉凶盘");
      expect(within(wheelBack).getByLabelText(/^北：/).getAttribute("aria-label")).toMatch(/吉/);
    });
  });

  it("居所 facing 为 null（不确定）时降级 Layer 0：不渲染宅八方，仍渲染本命八方", async () => {
    dwellingsFixture.current = [DWELLING_UNKNOWN_FACING];
    await renderPage();
    await waitFor(() =>
      expect(screen.getByText("这个居所的朝向未确定，下面只按你的本命方位给建议。")).toBeInTheDocument(),
    );
    expect(screen.getByText("本命八方")).toBeInTheDocument();
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    expect(screen.queryByText("房屋八方")).toBeNull();
    expect(screen.queryByLabelText("房屋八方吉凶盘")).toBeNull();
  });

  it("LLM 失败时宅八方与化解清单仍完整渲染（波1 性质不得回退）", async () => {
    dwellingsFixture.current = [dwellingL1()];
    // entitled 探测（GET）与叙述生成（POST）是两件独立的事——这条测试测的是「叙述
    // 生成失败」，entitled 探测本身必须成功，否则会连累骨架被 Paywall 挡住，
    // 测的就不再是这条测试自己声称要测的东西了。
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => jsonResponse({ entitled: true }),
        POST: () => new Response("boom", { status: 503 }),
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText(/叙述暂时生成不出来/)).toBeInTheDocument());

    // 宅八方是确定性派生，与这次失败的 fetch 无关——必须完整渲染，不能因叙述缺失被连带隐藏。
    expect(screen.getByLabelText("房屋八方吉凶盘")).toBeInTheDocument();
    expect(screen.getByText("坎宅")).toBeInTheDocument();

    // 化解清单同样确定性；独立算出真实的 Layer 1 化解集合（含宅层条目），
    // 逐条核对渲染内容，而不是只看数量或假设"能渲染就行"。
    const l1 = computeFengshui({
      birth, chart: profile.chart,
      dwelling: { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S" },
    });
    expect(l1.remedies.length).toBeGreaterThan(fs.remedies.length);
    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    for (const r of l1.remedies) {
      expect(screen.getByText(r.action)).toBeInTheDocument();
    }
  });
});

/**
 * 最终评审 I1：同住人上限此前**只存在于服务端**（route 的
 * `z.array(...).max(MAX_COHABITANTS)`），选择器不设限、本页也不截断。
 *
 * 失败场景（默认配置下档案数量本就无限制）：用户勾 9 位同住人存下 → 此后**每次**
 * 加载本页都 POST 9 位 → Zod 400 → `setFailed(true)` → 「叙述暂时生成不出来」+
 * 一个**永远不可能成功**的重试按钮，用户无从把失败和同住人列表联系起来。
 *
 * 选择器那头的上限在 `__tests__/DwellingForm.test.tsx` 覆盖；这里覆盖的是另一半：
 * **上限存在之前就已经存下来的**超限居所，本页必须自己截断才救得回来——那批数据
 * 用户改不动（选择器只挡新增），不截断就是永久卡死。
 */
describe("最终评审 I1：超限的既有居所不得把叙述请求打成 400", () => {
  /** 9 位（= MAX_COHABITANTS + 1）同住人，全部登记在同一个居所上。 */
  const OVER_LIMIT_IDS = Array.from({ length: MAX_COHABITANTS + 1 }, (_, i) => `over${i}`);

  function seedOverLimitCohabitants() {
    for (const id of OVER_LIMIT_IDS) {
      profilesById.set(id, { ...cohabProfile, id, nickname: `同住${id}` });
    }
    dwellingsFixture.current = [dwellingL1(OVER_LIMIT_IDS)];
  }

  it("叙述请求最多带 MAX_COHABITANTS 位同住人（与服务端 Zod 上限同源，不会 400）", async () => {
    seedOverLimitCohabitants();
    const postBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          postBodies.push(JSON.parse(String(init?.body ?? "{}")));
          return jsonResponse({ sections: SECTIONS, degraded: false });
        }
        return jsonResponse({ entitled: true });
      }),
    );

    await renderPage();
    await waitFor(() => expect(postBodies).toHaveLength(1));

    const cohabitants = postBodies[0]!.cohabitants as unknown[];
    // 上限值本身取自 `@/lib/fengshui-limits`——与 route.ts 的 `.max()` 是同一个常量，
    // 不是两份各自写死的 8。真正把这个数字钉死在 8 的是 route.test.ts 的边界两条
    // （恰好 8 通过 / 9 返回 400）：常量若被改小，那两条当场变红。
    expect(cohabitants).toHaveLength(MAX_COHABITANTS);
    // 超限那 1 位确实被丢掉了，而不是「凑巧只有 8 位档案加载成功」
    expect(OVER_LIMIT_IDS).toHaveLength(MAX_COHABITANTS + 1);
    expect(screen.queryByText(/叙述暂时生成不出来/)).toBeNull();
  });

  it("页面上的合看 chips 同样只到 MAX_COHABITANTS 位——请求与本地确定性派生不得各截各的", async () => {
    // 若只在拼 POST body 时截断、不截 cohabitantProfiles，页面上会渲染 9 个 chip，
    // 而服务端叙述只知道其中 8 位——用户点开第 9 位，叙述里永远不会提到 ta。
    seedOverLimitCohabitants();
    await renderPage();
    await waitFor(() => expect(screen.getByText("以谁的视角看")).toBeInTheDocument());

    const shown = OVER_LIMIT_IDS.filter((id) =>
      screen.queryByRole("button", { name: new RegExp(`^同住${id}$`) }) != null,
    );
    expect(shown).toHaveLength(MAX_COHABITANTS);
  });
});

describe("EP-fs-15 Layer 1 指纹与缓存（复审必修1：指纹须真正随居所字段变化）", () => {
  // 居所朝向「南」+ 同住人 p2；与顶部 dwellingL1() 默认值一致，这里显式重写一份
  // 而非依赖默认参数，避免默认值将来被别处改动时这里的期望悄悄漂移。
  const dwelling = dwellingL1(["p2"]);

  it("命中用真实居所字段（facing + memberProfileIds）算出的指纹缓存时，不发起请求", async () => {
    dwellingsFixture.current = [dwelling];
    const fp = fengshuiFingerprint({
      profileId: "p1", locale: "zh", engineVersion: FENGSHUI_ENGINE_VERSION,
      dwelling: { id: dwelling.id, facing: dwelling.facing!, tenancy: dwelling.tenancy, kind: dwelling.kind },
      memberProfileIds: dwelling.memberProfileIds,
    });
    reportStore.set(fp, { situation: "L1-FP-HIT", youAndSpace: "y", actions: "a" });
    // entitled 探测（GET）与「报告是否命中缓存」是两件独立的事——即使叙述报告命中
    // 缓存、不需要发起叙述 POST，entitled 探测仍然要发生（它决定宅八方/合看要不要
    // 渲染，与叙述缓存命中与否无关）。这里只断言"POST 没有发生"，不再断言
    // "fetch 完全没被调用过"。
    const fetchSpy = methodRouter({ GET: () => jsonResponse({ entitled: true }) });
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage();

    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    expandNarrative();
    expect(screen.getByText("L1-FP-HIT")).toBeInTheDocument();
    expect(fetchSpy.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(false);
  });

  it("朝向变化后不再命中旧指纹（旧报告按朝向「南」缓存，实际居所朝向已变成「北」），重新发起请求且请求恰好一次", async () => {
    dwellingsFixture.current = [{ ...dwelling, facing: "N" }];
    const staleFp = fengshuiFingerprint({
      profileId: "p1", locale: "zh", engineVersion: FENGSHUI_ENGINE_VERSION,
      dwelling: { id: dwelling.id, facing: "S", tenancy: dwelling.tenancy, kind: dwelling.kind },
      memberProfileIds: dwelling.memberProfileIds,
    });
    reportStore.set(staleFp, { situation: "STALE-FACING", youAndSpace: "y", actions: "a" });
    const fetchSpy = methodRouter({
      GET: () => jsonResponse({ entitled: true }),
      POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage();

    const postCalls = () => fetchSpy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    await waitFor(() => expect(postCalls().length).toBeGreaterThan(0));
    expect(screen.queryByText("STALE-FACING")).toBeNull();
    // 顺带修：Layer 1 有专门的守卫防止「居所未落定先按 Layer 0 请求一次、居所到手
    // 再请求一次」的双倍 LLM 账单，但该守卫此前零断言。这里锁定叙述 POST 恰好一次
    // （entitled 探测 GET 是另一件独立的事，不计入这个「恰好一次」——它本身没有
    // 这种双请求风险，见 page.tsx 里对 GET 的守卫只依赖 dwellingInput）。
    expect(postCalls()).toHaveLength(1);
  });

  it("同住人集合变化后不再命中旧指纹（旧报告按「无同住人」缓存，实际已有同住人 p2），重新发起请求", async () => {
    dwellingsFixture.current = [dwelling]; // memberProfileIds: ["p2"]
    const staleFp = fengshuiFingerprint({
      profileId: "p1", locale: "zh", engineVersion: FENGSHUI_ENGINE_VERSION,
      dwelling: { id: dwelling.id, facing: dwelling.facing!, tenancy: dwelling.tenancy, kind: dwelling.kind },
      memberProfileIds: [],
    });
    reportStore.set(staleFp, { situation: "STALE-MEMBERS", youAndSpace: "y", actions: "a" });
    const fetchSpy = methodRouter({
      GET: () => jsonResponse({ entitled: true }),
      POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage();

    await waitFor(() =>
      expect(fetchSpy.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(true),
    );
    expect(screen.queryByText("STALE-MEMBERS")).toBeNull();
  });
});

describe("EP-fs-15 居所读取失败（复审必修2）", () => {
  it("listDwellings 失败时显示「居所读取失败」+ 重试入口，而不是「还没登记居所」；且留痕（console.warn）", async () => {
    dwellingsFixture.error = new Error("supabase 抖动");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await renderPage();

    await waitFor(() => expect(screen.getByText(/居所读取失败/)).toBeInTheDocument());
    // 两者对用户是完全不同的意思：读取失败 ≠ 确认为空。绝不能把一次 Supabase 抖动
    // 误判成「还没登记」，那会诱导用户重复登记已存在的居所。
    expect(screen.queryByText(/还没登记居所/)).toBeNull();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("点击重试后重新调用 listDwellings，成功后恢复正常渲染、错误提示消失", async () => {
    dwellingsFixture.error = new Error("supabase 抖动");
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await renderPage();
    await waitFor(() => expect(screen.getByText(/居所读取失败/)).toBeInTheDocument());

    dwellingsFixture.error = null;
    dwellingsFixture.current = [dwellingL1()];
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => expect(screen.getByText("坎宅")).toBeInTheDocument());
    expect(screen.queryByText(/居所读取失败/)).toBeNull();
  });
});

describe("withTimeout（复审必修2 次级风险：请求永远 pending 也不能让用户什么都看不到）", () => {
  // page.tsx 原来的居所加载 IIFE 只在 listDwellings() 外套了一层 `.catch(() => [])`——
  // 若该请求既不 resolve 也不 reject（真实网络里完全可能），下面的 await 会永远卡住：
  // dwellingsError 永远不会置位，narrative-fetch 的守卫也永远等不到 dwellings 落定，
  // 用户什么提示都看不到，比「显示错误」更差。用超时把「永远 pending」转换成
  // 「有限时间后 reject」，纳入统一的 catch 处理。这里直接单测这个转换本身（用很小的
  // ms 值 + 真实定时器），不必也不该为了验证它去真的等 page.tsx 里生产用的超时时长。
  it("包裹的 promise 永远不 settle 时，超时后以超时错误 reject，而不是永远挂起", async () => {
    const { withTimeout } = await import("../page");
    const neverSettles = new Promise<never>(() => {});
    await expect(withTimeout(neverSettles, 20)).rejects.toThrow();
  });

  it("包裹的 promise 先于超时正常 resolve 时，原样透传结果", async () => {
    const { withTimeout } = await import("../page");
    await expect(withTimeout(Promise.resolve("ok"), 1000)).resolves.toBe("ok");
  });

  it("包裹的 promise 先于超时 reject 时，原样透传该错误（不是超时错误）", async () => {
    const { withTimeout } = await import("../page");
    await expect(withTimeout(Promise.reject(new Error("原始错误")), 1000)).rejects.toThrow("原始错误");
  });
});

describe("EP-fs-15 命宅相配/相冲判语（复审必修3）", () => {
  // f.dwelling.matchWithPerson 每张 Layer 1 盘都算好了，且 core 的 buildDwellingRemedies
  // 已经在用它生成宅层化解——页面此前对这个判语零展示，用户看不到「同屏两个标签合不合」。

  it("命卦与宅卦同组时，显示「相配」对应的判语", async () => {
    dwellingsFixture.current = [dwellingL1()]; // 向南 → 坐北 → 坎宅（东四宅），与主档案坎(东四命)同组
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎宅")).toBeInTheDocument());
    expect(screen.getByText("你的本命卦与这套宅子同组，整体气场比较合拍。")).toBeInTheDocument();
  });

  it("命卦与宅卦不同组时，显示「相冲」对应的非决定论判语——不下断语，重点落在自己的四吉方", async () => {
    dwellingsFixture.current = [
      { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "SE", memberProfileIds: [] },
    ]; // 向东南 → 坐西北 → 乾宅（西四宅），与主档案坎(东四命)不同组
    await renderPage();
    await waitFor(() => expect(screen.getByText("乾宅")).toBeInTheDocument());
    expect(
      screen.getByText("你的本命卦与这套宅子不同组，不必因此忧虑——把重点放在你自己的四吉方即可。"),
    ).toBeInTheDocument();
  });
});

describe("最终评审 Blocking 2：「和 Mira 聊聊这条」链接要带得动实际内容，且受「灵」flag 门控", () => {
  // 复审指出：此前 href 只带 remedyId（如 `?topic=fengshui:fs-desk-sheng`），
  // /spirit 只认 topic==="portrait"，id 被解析出来即丢弃，用户落进空白通用聊天——
  // 是「复用了 URL 形状，没复用机制」。下面的测试断言行为（q 参数真的带着这条化解
  // 的动作文本、灵关闭时链接压根不存在），不再只断言 href 正则（那样的断言即使
  // /spirit 端完全不解析这个 id 也照样通过，抓不住这个 bug）。
  // Task 9：化解卡片移到「化解」tab，查询前需先切换过去。

  it("灵开启时，每条化解链接指向 /spirit?topic=fengshui&q=<那一条自己的动作文本>（不是无意义的 id）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
    const { truncateForSpiritQuery } = await import("../page");
    await renderPage();
    // 等叙述结算完（而非只等盘图），让本测试内该请求的 .then 在测试结束前跑完，避免遗留到下一条测试才 resolve。
    // 用「展开完整解读」按钮出现当结算信号——它只在 sections && !degraded 时渲染，
    // 比 getByText("甲") 更准：这条测试不关心叙述内容本身，不需要真的点开它。
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    const links = screen.getAllByText("和 Mira 聊聊这条");
    // page.tsx 按 fs.remedies 数组原序 .map 渲染卡片，不重新排序——逐条按位置对拍，
    // 不假设某条化解「恒为第一条」（sortRemedies 的实际输出顺序不是这么回事）。
    expect(links.length).toBe(fs.remedies.length);
    links.forEach((link, i) => {
      const href = link.closest("a")!.getAttribute("href")!;
      const url = new URL(href, "http://localhost");
      expect(url.pathname).toBe("/spirit");
      expect(url.searchParams.get("topic")).toBe("fengshui");
      // q 必须是这条化解自己的动作文本（截断规则与 page.tsx 用同一个函数），
      // 而不是像此前那样只带一个 /spirit 端根本不认得的 remedyId。
      expect(url.searchParams.get("q")).toBe(truncateForSpiritQuery(fs.remedies[i]!.action));
    });
  });

  it("灵未开启时不渲染「和 Mira 聊聊这条」链接，避免把用户送进 /spirit 的「尚未开启」死胡同", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", ""); // 显式关闭；与「未设置」等价，但意图更明确
    await renderPage();
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    expect(screen.getByText("可做的事")).toBeInTheDocument(); // 确认真的切到了会渲染卡片的 tab
    expect(screen.queryByText("和 Mira 聊聊这条")).toBeNull();
  });

  it("动作文本较长时对 q 参数做合理截断，不放任 URL 无限增长", async () => {
    const { truncateForSpiritQuery } = await import("../page");
    const long = "久".repeat(200);
    const truncated = truncateForSpiritQuery(long);
    expect(truncated.length).toBeLessThan(long.length);
    expect(truncated.length).toBeLessThanOrEqual(81); // 80 字符上限 + 1 个省略号
    expect(truncated.endsWith("…")).toBe(true);

    const short = "久坐处朝向调到东南";
    expect(truncateForSpiritQuery(short)).toBe(short); // 未超限时原样返回，不画蛇添足
  });
});

describe("EP-fs-07 /fengshui Layer 0 — 报告缓存", () => {
  it("成功且未降级时叙述正常渲染，并持久化到服务端供下次直读", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    expandNarrative();
    expect(screen.getByText("甲")).toBeInTheDocument();
    // 直接查 reportStore（saveFengshuiReport mock 的落点），而不是只断言它「被调用过」——
    // 后者抓不住「指纹算错」或「sections 传错」这类问题（弱断言在本项目已连续栽过跟头）。
    expect(reportStore.get(FP_ZH)).toEqual(SECTIONS);
  });

  it("已有服务端报告时直接读取渲染，不发起网络请求", async () => {
    reportStore.set(FP_ZH, { situation: "缓存内容", youAndSpace: "y", actions: "a" });
    const fetchSpy = vi.fn(async () => new Response("不该被调用到"));
    vi.stubGlobal("fetch", fetchSpy);
    await renderPage();
    // 等真正依赖该异步分支的内容出现（「展开」按钮只在 sections && !degraded 落定后
    // 才渲染），而不是拿盘图（同步可得、不依赖缓存分支）当代理——后者会在缓存读取的
    // effect 真正落定前就先满足，产生间歇性通过的假阳性。展开后再断言缓存文本本身。
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    expandNarrative();
    expect(screen.getByText("缓存内容")).toBeInTheDocument();
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("最终评审 Blocking 1：叙述解析失败（模型输出未含合法 H2 标题）时不写缓存、显示重试入口，而不是缓存一份三节皆空的报告", async () => {
    // @eamvp/llm 的 generateFengshuiReading 已改为：三节全部解析为空时抛错，不再返回
    // 200 + 空 sections（见 packages/llm/src/fengshui/index.test.ts 的对应用例）。
    // route.ts 的 catch-all 把这类抛错转成 500——从本页面 fetch 调用方视角，与其他失败
    // 原因（网络故障、LLM 未配置）不可区分，统一走 failed 路径：不落盘缓存、给重试入口。
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("风水报告生成失败：风水叙述解析失败：模型输出未包含任何可识别的分节标题", { status: 500 })),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText(/叙述暂时生成不出来/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "重新生成叙述" })).toBeInTheDocument();
    expect(reportStore.has(FP_ZH)).toBe(false);
  });
});

describe("EP-fs-07 /fengshui Layer 0 — degraded 报告的消费", () => {
  it("方位纠正导致 degraded 时：不直接渲染叙述、给出可见可信度提示、且不写入缓存", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: true })));
    await renderPage();
    // 等待可信度提示本身（真正依赖 fetch → setDegraded 那条异步链路落定的内容），
    // 而不是拿盘图当代理——盘图渲染不依赖这次 fetch，会在 fetch 回调跑完前就已存在，
    // 导致这里的断言在 setDegraded/setNarrative 生效前就执行、间歇性通过。
    await waitFor(() => expect(screen.getByText(/系统纠正/)).toBeInTheDocument());

    // 确定性内容不受影响
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    expect(screen.getByText("可做的事")).toBeInTheDocument();
    // degraded 提示在「化解」tab 也一样可见（两个 tab 各自独立渲染同一份状态）
    expect(screen.getByText(/系统纠正/)).toBeInTheDocument();
    // 叙述本体（含被机械纠正过星名、但周边论述仍可能建立在错误方位上）不能被当作正常结果直接渲染
    expect(screen.queryByText("甲")).toBeNull();
    // 不可信叙述不落盘持久化，避免一份带瑕疵的报告被永久复用
    expect(reportStore.has(FP_ZH)).toBe(false);
  });

  it("未降级（degraded: false）时不显示可信度提示", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: false })));
    await renderPage();
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    expect(screen.queryByText(/系统纠正/)).toBeNull();
  });
});

describe("EP-fs-07 /fengshui Layer 0 — 英文 locale", () => {
  it("locale=en 时化解清单成本标签走 i18n 翻译，不泄漏中文原文", async () => {
    await renderPage("en");
    // 等叙述结算（内容本身仍是 mock 的中文占位符，与本测试无关；只是借它确保测试结束前
    // 该请求的 .then 已经跑完，不遗留到下一条测试才 resolve、触发 act() 警告）。
    // 「展开」按钮只在 sections 落定后渲染，同样能当结算信号，不需要真的点开它。
    await waitFor(() => expect(screen.getByText("Read the full reading →")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Remedies" }));
    // fs-desk-sheng（生气方书桌建议）恒为 buildPersonalRemedies 输出的第一条、effort 恒为「零成本」
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.queryByText("零成本")).toBeNull();
  });
});

describe("EP-fs-07 /fengshui Layer 0 — 缓存键的判别力（Task 14 复审必修3）", () => {
  // 现有测试此前的期望值全部由 fengshuiCacheKey 自己算出来，属于自证——
  // 把 locale/engineVersion 从缓存键公式里删掉，那些测试照样全绿。这里改用
  // 「预先在另一把指纹下塞入报告，断言运行时确实没有命中它、fetch 确实被调用」
  // 的写法，只要 fengshuiFingerprint 的输出不再随该参数变化，这两条测试就会变红。
  // （Task 7 把 fengshuiCacheKey/localStorage 换成 fengshuiFingerprint/reportStore，
  // 断言结构原样保留，只换了底层存取方式。）

  it("locale 切换后不会读到旧语言报告：zh 报告已存在，仍以 locale=en 渲染时应发起新请求", async () => {
    reportStore.set(FP_ZH, { situation: "旧中文报告", youAndSpace: "y", actions: "a" });

    const fetchSpy = vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: false }));
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage("en");

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    // 顺带确认没有误读旧语言报告的内容
    expect(screen.queryByText("旧中文报告")).toBeNull();
  });

  it("引擎版本变化后不会读到旧版本报告：非当前版本的指纹已存在，仍应发起新请求", async () => {
    reportStore.set(fpFor("zh", "not-the-current-engine-version"), { situation: "旧引擎版本报告", youAndSpace: "y", actions: "a" });

    const fetchSpy = vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: false }));
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage("zh");

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByText("旧引擎版本报告")).toBeNull();
  });
});

describe("EP-fs-07 /fengshui Layer 0 — 重试入口（Task 14 复审必修4）", () => {
  it("degraded 时显示重试入口，点击后重新发起生成、成功后恢复正常渲染", async () => {
    const fetchSpy = vi.fn();
    fetchSpy.mockResolvedValueOnce(jsonResponse({ sections: SECTIONS, degraded: true }));
    fetchSpy.mockResolvedValueOnce(jsonResponse({ sections: SECTIONS, degraded: false }));
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage();
    await waitFor(() => expect(screen.getByText(/系统纠正/)).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "重新生成叙述" }));

    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    expandNarrative();
    expect(screen.getByText("甲")).toBeInTheDocument();
    expect(screen.queryByText(/系统纠正/)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("failed 时显示重试入口，点击后重新发起生成、成功后恢复正常渲染", async () => {
    const fetchSpy = vi.fn();
    fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 503 }));
    fetchSpy.mockResolvedValueOnce(jsonResponse({ sections: SECTIONS, degraded: false }));
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage();
    await waitFor(() => expect(screen.getByText(/叙述暂时生成不出来/)).toBeInTheDocument());
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "重新生成叙述" }));

    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    expandNarrative();
    expect(screen.getByText("甲")).toBeInTheDocument();
    expect(screen.queryByText(/叙述暂时生成不出来/)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("EP-fs-07 /fengshui Layer 0 — locale 切换时的状态重置与竞态保护（Task 14 复审顺带修）", () => {
  it("上一语言遗留的 degraded 不会残留：切到已有可信缓存的新语言时，叙述正常显示、不再挂着旧的降级提示", async () => {
    // 复现场景：zh 请求判定 degraded（叙述被隐藏、显示提示），随后用户切到 en——
    // en 恰好已有一份可信缓存。旧代码的缓存命中分支直接 `setNarrative(cached); return;`，
    // 从不重置 `degraded`，于是新语言的可信内容会被上一语言遗留的 `degraded === true` 挡住。
    reportStore.set(FP_EN, { situation: "EN-SITUATION-OK", youAndSpace: "EN-SPACE-OK", actions: "EN-ACTIONS-OK" });
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: true })));

    const { default: Page } = await import("../page");
    const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
    const { LocaleSwitch } = await import("@/lib/i18n/switch");

    render(
      <I18nProvider locale="zh">
        <LocaleSwitch />
        <Page />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText(/系统纠正/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("radio", { name: "English" }));

    await waitFor(() => expect(screen.getByText("Read the full reading →")).toBeInTheDocument());
    // 这条测试已切到英文 locale，不用共享的 expandNarrative()（硬编码中文按钮文案）——
    // 直接点刚等到的那个英文按钮。
    fireEvent.click(screen.getByText("Read the full reading →"));
    expect(screen.getByText("EN-SITUATION-OK")).toBeInTheDocument();
    // en 的可信缓存应当正常显示，不能被 zh 遗留下来的 degraded 提示挡住
    expect(screen.queryByText(/auto-corrected/)).toBeNull();
  });
});

/**
 * 会员闸门（Task 10，EP-fs-17）。spec §11 边界：Layer 0（本命方位、物件顾问弱版）
 * 永远免费；住宅实盘（宅八方）+ 分级化解、多住客合看是会员功能。page.tsx 自己不
 * 知道 BILLING_ENABLED（服务端专属 env，无 NEXT_PUBLIC_ 前缀）也不能直接查会员表
 * （getEntitlement 需要 service-role key）——它只认 GET /api/fengshui/reading
 * 返回的 `entitled` 布尔值，这里通过 methodRouter 的 GET handler 直接控制。
 *
 * ⚠️ 对照组只可能建立在 `entitled` 这一个输入上。修复单 Minor 2：本文件此前有
 * 「BILLING_ENABLED 关闭」与「开闸 + 会员」两条**逐字节相同**的测试（同夹具、同
 * `entitled:true` 桩、同断言），并在这里声称二者互为对照——但从页面视角这两种情形
 * 就是同一个输入（页面读不到 BILLING_ENABLED，只看得到 GET 返回的布尔值），其中一
 * 条判别力恒为零。已合并成下面那条「route 判定 entitled:true」。「BILLING_ENABLED
 * 关闭 ⇒ GET 返回 entitled:true」这一环由 route.test.ts 的 GET 分组独立覆盖，
 * 那里才有真正的 env 对照组。
 * 真正的对照是 `entitled:true` ↔ `entitled:false` 两条用同一份居所夹具
 * （dwellingL1(["p2"])）的测试：闸门被写反或被删掉时，两条中至少一条变红。
 */
describe("EP-fs-17 会员闸门（Task 10）", () => {
  const dwellingBody = { id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "S" as const };
  /** Layer 1（含宅层）与 Layer 0（个人层）化解集合，用来精确核对「化解 tab 究竟展示了哪些条目」，
   *  而不是只看数量或存在性。 */
  const l1 = computeFengshui({ birth, chart: profile.chart, dwelling: dwellingBody });
  const dwellingOnlyRemedyIds = new Set(l1.remedies.map((r) => r.id));
  fs.remedies.forEach((r) => dwellingOnlyRemedyIds.delete(r.id));

  it("宅层化解集合非空（前提校验）：若这个前提不成立，下面「只显示个人层」的测试会失去意义", () => {
    expect(dwellingOnlyRemedyIds.size).toBeGreaterThan(0);
  });

  it("开闸 + 非会员：Layer 0 内容（本命卦、本命八方）与物件顾问入口照常可见——免费层不能被误伤", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => jsonResponse({ entitled: false }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.getByText("本命八方")).toBeInTheDocument();
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "添置" }));
    expect(screen.getByText("我想添置…")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "看看放哪儿好" })).toBeInTheDocument();
  });

  it("开闸 + 非会员：宅八方与合看被 Paywall 取代", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => jsonResponse({ entitled: false }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText("升级会员，解锁无限")).toBeInTheDocument());

    // 宅八方消失
    expect(screen.queryByText("房屋八方")).toBeNull();
    expect(screen.queryByLabelText("房屋八方吉凶盘")).toBeNull();
    expect(screen.queryByText("坎宅")).toBeNull();
    // 合看（切视角 chips + 对照说明）一并消失——不能只挡宅盘、漏了合看
    expect(screen.queryByText("以谁的视角看")).toBeNull();
    expect(screen.queryByRole("button", { name: "阿乙" })).toBeNull();
    // Layer 0（本命八方）不受影响——它是免费内容
    expect(screen.getByText("本命八方")).toBeInTheDocument();
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();

    // 修复单 Minor 4：上面全是「付费内容没渲染出来」——UI 投影。这一条测的是**要求
    // 本身**（Important 2）：付费派生内容根本没被算出来。被挡时页面对 computeFengshui
    // 的每一次调用都不得带 dwelling/cohabitants，否则 f.dwelling.sectors /
    // matchWithPerson / 宅层化解就实实在在活在非会员的浏览器 state 里了。
    // 协调一致地退回原设计（裸 dwellingInput 算 fs + JSX 单独判 entitled）能让上面
    // 那些 UI 断言全绿通过，只有这一条抓得住。
    expect(computeFengshuiCalls.args.length).toBeGreaterThan(0);
    for (const input of computeFengshuiCalls.args) {
      expect(input.dwelling).toBeUndefined();
      expect(input.cohabitants).toBeUndefined();
    }
  });

  // 修复单 Minor 2：这条是原来「BILLING_ENABLED 关闭」与「开闸 + 会员」两条逐字节
  // 相同测试的合并结果——页面只认 GET 返回的 entitled，分不清（也不需要分清）这两种
  // 情形，保留两条其中一条的判别力恒为零。
  it("route 判定 entitled:true（对应 BILLING_ENABLED 关闭，或已是会员）：宅八方与合看正常渲染，无任何限制", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => jsonResponse({ entitled: true }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText("房屋八方")).toBeInTheDocument());
    expect(screen.getByLabelText("房屋八方吉凶盘")).toBeInTheDocument();
    expect(screen.getByText("坎宅")).toBeInTheDocument();
    expect(screen.getByText("以谁的视角看")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "阿乙" })).toBeInTheDocument();
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
  });

  it("开闸 + 非会员 + 有宅：化解 tab 只显示个人层化解，宅层分级化解不可见", async () => {
    dwellingsFixture.current = [dwellingL1()];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => jsonResponse({ entitled: false }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText("升级会员，解锁无限")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    for (const r of fs.remedies) {
      expect(screen.getByText(r.action)).toBeInTheDocument();
    }
    for (const r of l1.remedies) {
      if (dwellingOnlyRemedyIds.has(r.id)) expect(screen.queryByText(r.action)).toBeNull();
    }
  });

  it("开闸 + 会员 + 有宅：化解 tab 显示完整化解（含宅层分级化解）", async () => {
    dwellingsFixture.current = [dwellingL1()];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => jsonResponse({ entitled: true }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎宅")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    expect(l1.remedies.length).toBeGreaterThan(fs.remedies.length);
    for (const r of l1.remedies) {
      expect(screen.getByText(r.action)).toBeInTheDocument();
    }
  });

  it("开闸 + 非会员 + 有宅：叙述请求仍会发出，但降级为 Layer 0（不携带 dwelling/cohabitants）——免费层的叙述不因居所被挡而整体消失", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    // methodRouter 不记录请求体，这里改用一个能记录 POST body 的裸 vi.fn，
    // 直接核对「非会员 + 有宅」时叙述请求到底带没带 dwelling/cohabitants。
    const postBodies: Record<string, unknown>[] = [];
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "POST") {
        postBodies.push(JSON.parse(String(init?.body ?? "{}")));
        return jsonResponse({ sections: SECTIONS, degraded: false });
      }
      return jsonResponse({ entitled: false });
    });
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage();
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());

    expect(postBodies).toHaveLength(1);
    expect(postBodies[0]).not.toHaveProperty("dwelling");
    const cohab = postBodies[0]!.cohabitants as unknown[] | undefined;
    expect(cohab === undefined || cohab.length === 0).toBe(true);
    // 叙述照常显示——不是被 402 打成一整段"叙述暂时生成不出来"
    expect(screen.queryByText(/叙述暂时生成不出来/)).toBeNull();
  });

  it("开闸 + 非会员：付费墙用的是「这是会员功能」文案（修复单 Important 5）", async () => {
    // 宅盘所在的位置既没有"上限"也没有要"保存"的东西，措辞必须是 reason="member"。
    //
    // ⚠️ 这条原来还有一句 `expect(queryByText(zh.paywall.subtitleLimit)).toBeNull()`。
    // 最终评审 I2 撤除了 /fengshui/dwellings 的多居所闸门——那是 `reason="limit"` 唯一
    // 的调用点，分支与 `paywall.subtitleLimit` 文案已一并删除（见 components/Paywall.tsx）。
    // 于是那句反向断言变成了恒真：被断言缺席的字符串在运行时代码里已不存在，任何变异
    // 都撞不红它，而这个仓库正是被同一个形状的恒真断言坑过（`47e9faa`）。删掉它，
    // 保护改由下面这条**正向**断言承担：措辞一旦被改回按次/按量的口吻（reason="quota"，
    // 现存的另一个分支），渲染出来的就是 subtitleQuota，这条当场变红。
    dwellingsFixture.current = [dwellingL1(["p2"])];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => jsonResponse({ entitled: false }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText(zh.paywall.subtitleMember)).toBeInTheDocument());
    // 对照：另一个仍然存在的分支（quota）的文案不得出现在这里。它有真实调用点
    // （/calendar、/chart、/account 的额度墙），不是一个不存在的字符串。
    expect(screen.queryByText(zh.paywall.subtitleQuota)).toBeNull();
  });

  it("开闸 + 非会员：付费墙取代宅盘的同时，绝不能改口说这个居所「朝向未确定」，也不得泄漏命宅相配判语", async () => {
    // 修复单 Important 2 的直接回归：fs 改从 effectiveDwellingInput 算之后，被挡用户的
    // f.layer 变成 0——若引导语区块仍按 f.layer 判断，就会渲染出来，并且因为
    // `dwelling` 非空而落在 facingUnknownNote 分支上，告诉一个明明登记了朝南居所的
    // 用户"这个居所的朝向未确定"。
    //
    // 修复单 Minor 2：原来这条还断言了「还没登记居所」文案与「登记居所」链接缺席，
    // 标题也这么写——但那两条恒真：引导语三元（page.tsx:648-657）里 noDwelling 分支
    // 只在 `dwelling` 为空时才走，而本条夹具永远有一个居所，本 diff 的任何变异都到不了
    // 那个分支。留着等于宣称提供了一份并不存在的保护，已删除并据实改写标题。
    // 真正有判别力的是下面两条：朝向文案不得改口、Layer 1 派生的判语不得泄漏。
    dwellingsFixture.current = [dwellingL1(["p2"])];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => jsonResponse({ entitled: false }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText("升级会员，解锁无限")).toBeInTheDocument());

    expect(screen.queryByText(/朝向未确定/)).toBeNull();
    // Layer 1 派生的命宅相配判语同样不得泄漏（它属于住宅实盘）
    expect(screen.queryByText(/与这套宅子/)).toBeNull();
  });
});

/**
 * 修复单 Critical 1：闸门泄漏进 `BILLING_ENABLED` 关闭的默认配置。
 *
 * 原实现里 `entitled` 只有 `boolean | undefined` 三种取值，且**探测失败也置 false**，
 * 于是「还没问到」和「问失败了」都被渲染成付费墙。后果（`BILLING_ENABLED` 未设置时，
 * 也就是默认配置，服务端对任何人都放行）：
 *   - 任何有居所的用户每次加载都会先闪一下「升级会员，解锁无限」；
 *   - 探测请求失败（冷启动 / 502 / 离线 / 广告拦截）时**该次加载永久显示付费墙**，
 *     把用户本来一直看得到的宅盘换成了推销。
 * 这两个方向此前零断言——既有页面测试全部 `waitFor` 到稳定态。
 */
describe("EP-fs-17 会员闸门（Task 10 修复单 Critical 1）：未知 ≠ 非会员", () => {
  /** 把所有在途 promise/effect 排空，让"之后还会不会再发生点什么"变成确定性的。 */
  async function drainEffects(rounds = 10) {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  }

  it("探测在途（GET 尚未返回）：Layer 1 区块显示加载态，不出现付费墙；Layer 0 内容完整渲染", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    // 修复单 Minor 3：桩存到局部变量，好在末尾真的去数 POST 次数（原来那句"叙述 POST
    // 也不该抢跑"的注释下面并没有任何对应断言，只是又检查了一遍付费墙缺席）。
    const fetchSpy = methodRouter({
      // 永不落定：精确模拟"探测请求还在路上"这个中间态。
      GET: () => new Promise<Response>(() => {}),
      POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    await renderPage();

    // Layer 0（免费层）内容不受任何影响
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.getByText("本命八方")).toBeInTheDocument();
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();

    // Layer 1 区块：加载态，而**不是**付费墙——付费墙是终局判定，不是等待态
    expect(screen.getByText("加载中…")).toBeInTheDocument();
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
    // 也不能提前渲染会员内容（另一个方向：不能因为"还没被拒"就先放行）
    expect(screen.queryByLabelText("房屋八方吉凶盘")).toBeNull();
    // 更不能改口说这个居所的朝向没确定（修复单 Minor 2：原来这里断言的是「还没登记
    // 居所」缺席，但引导语三元里 noDwelling 分支只在 `dwelling` 为空时才走，本条夹具
    // 永远有一个居所 → 那条恒真。真正会在引导语判据退回 f.layer 时冒出来的是这句。）
    expect(screen.queryByText(/朝向未确定/)).toBeNull();

    // 探测始终不落定 → 叙述 POST 也不该抢跑（它要等闸门落定，见双 POST 守卫）。
    // 修复单 Minor 3：这里以前只有注释、没有断言——真去数一次 POST，让注释成为真话。
    await drainEffects(3);
    const postCalls = fetchSpy.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "POST");
    expect(postCalls).toHaveLength(0);
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
  });

  it("探测失败（fetch 抛错）：给「重新确认」入口而不是付费墙；免费层叙述照常拿得到", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") return jsonResponse({ sections: SECTIONS, degraded: false });
        throw new Error("network down");
      }),
    );
    await renderPage();

    await waitFor(() => expect(screen.getByText(/会员状态暂时确认不了/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "重新确认" })).toBeInTheDocument();
    // 关键断言：探测失败**不得**等同于"确认非会员"
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
    expect(screen.queryByText("这块内容属于会员功能，升级后即可解锁。")).toBeNull();
    // Layer 0 完整可用，且免费层叙述不因探测失败而一并消失
    expect(screen.getByText("本命八方")).toBeInTheDocument();
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    expandNarrative();
    expect(screen.getByText("甲")).toBeInTheDocument();
  });

  it("探测返回 502（冷启动/代理故障）：同样按「资格未知」处理，不当作「确认非会员」", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => new Response("bad gateway", { status: 502 }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();

    await waitFor(() => expect(screen.getByText(/会员状态暂时确认不了/)).toBeInTheDocument());
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
    expect(screen.getByText("本命八方")).toBeInTheDocument();
  });

  it("探测返回 200 但 body 读不出 entitled 布尔值（广告拦截器/离线占位响应）：按未知处理，不 Boolean() 成 false", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => new Response("<html>offline</html>", { headers: { "content-type": "text/html" } }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();

    await waitFor(() => expect(screen.getByText(/会员状态暂时确认不了/)).toBeInTheDocument());
    expect(screen.queryByText("升级会员，解锁无限")).toBeNull();
  });

  it("探测失败后点「重新确认」：重新探测，成功后宅八方正常出现、未知提示消失", async () => {
    dwellingsFixture.current = [dwellingL1()];
    let getCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") return jsonResponse({ sections: SECTIONS, degraded: false });
        getCalls += 1;
        if (getCalls === 1) throw new Error("network down");
        return jsonResponse({ entitled: true });
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText(/会员状态暂时确认不了/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "重新确认" }));

    await waitFor(() => expect(screen.getByText("坎宅")).toBeInTheDocument());
    expect(screen.getByLabelText("房屋八方吉凶盘")).toBeInTheDocument();
    expect(screen.queryByText(/会员状态暂时确认不了/)).toBeNull();
    expect(getCalls).toBe(2);
  });
});

/**
 * 修复单 Important 4：客户端到底发不发 `Authorization` 头，此前零断言——
 * 两个页面测试文件都把 supabase 会话写死成 `session: null`，于是
 * `fengshuiAuthHeader()` 在每一条测试里都返回 `{}`。把 POST 与探测请求的
 * Authorization 头整个删掉，全套测试照样绿，而 `BILLING_ENABLED=1` 时每个非
 * Telegram（邮箱 / 匿名 Supabase）会员都会被静默 402 并挡在付费墙外。
 * route.test.ts 证明了**服务端**会读 Bearer，但没有任何东西证明**客户端**会发。
 */
describe("EP-fs-17 会员闸门（Task 10 修复单 Important 4）：客户端必须把会话 token 发出去", () => {
  function recordingFetch(calls: { method: string; headers: Record<string, string> }[]) {
    return vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, headers: (init?.headers ?? {}) as Record<string, string> });
      return method === "POST"
        ? jsonResponse({ sections: SECTIONS, degraded: false })
        : jsonResponse({ entitled: true });
    });
  }

  it("有 Supabase 会话时：闸门探测 GET 与叙述 POST 都带上 Authorization: Bearer <access_token>", async () => {
    supabaseSession.current = { access_token: "tok-abc" };
    dwellingsFixture.current = [dwellingL1()];
    const calls: { method: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", recordingFetch(calls));

    await renderPage();
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());

    const get = calls.find((c) => c.method === "GET");
    const post = calls.find((c) => c.method === "POST");
    expect(get).toBeDefined();
    expect(post).toBeDefined();
    expect(get!.headers.Authorization).toBe("Bearer tok-abc");
    expect(post!.headers.Authorization).toBe("Bearer tok-abc");
    // POST 原有的头不能被 authHeader 覆盖掉
    expect(post!.headers["content-type"]).toBe("application/json");
    expect(post!.headers["x-zj-locale"]).toBe("zh");
  });

  it("没有 Supabase 会话时不伪造 Authorization 头（对照组：证明上面那条断言真由会话驱动）", async () => {
    supabaseSession.current = null;
    dwellingsFixture.current = [dwellingL1()];
    const calls: { method: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", recordingFetch(calls));

    await renderPage();
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());

    expect(calls.find((c) => c.method === "GET")!.headers.Authorization).toBeUndefined();
    expect(calls.find((c) => c.method === "POST")!.headers.Authorization).toBeUndefined();
  });
});

/**
 * 修复单 Minor 3：`page.tsx` 里「有居所时必须等闸门探测落定才发叙述 POST」这个守卫
 * 是为防重复 LLM 计费，但此前唯一相关的断言（`expect(postCalls()).toHaveLength(1)`）
 * 紧跟在对**第一次** POST 的 `waitFor` 之后——第二次 POST 有没有发出去纯属竞态。
 * 这里在计数前把所有在途副作用排空，让"到底发了几次"变成确定性的。
 */
describe("EP-fs-17 会员闸门（Task 10 修复单 Minor 3）：叙述 POST 不得因闸门探测而发两次", () => {
  async function drainEffects(rounds = 10) {
    for (let i = 0; i < rounds; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  }

  it("有居所 + 会员：排空所有在途副作用后，叙述 POST 恰好一次，且那一次就是 Layer 1 请求（没有先发一次 Layer 0）", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    const postBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          postBodies.push(JSON.parse(String(init?.body ?? "{}")));
          return jsonResponse({ sections: SECTIONS, degraded: false });
        }
        return jsonResponse({ entitled: true });
      }),
    );

    await renderPage();
    // 先等**终态**：宅盘（闸门已放行）与叙述都已落定（「展开」按钮只在
    // sections && !degraded 时出现，同样能当叙述落定的信号）
    await waitFor(() => expect(screen.getByText("坎宅")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    // 再排空剩余的一切，之后计数才有意义
    await drainEffects();

    expect(postBodies).toHaveLength(1);
    // 守卫失效时，抢跑的那一次必然是 Layer 0（探测未落定 ⇒ effectiveDwellingInput
    // 为空）——所以"唯一那次带着 dwelling"这条断言同时锁住了次数与内容。
    expect(postBodies[0]).toHaveProperty("dwelling");
    expect((postBodies[0]!.dwelling as { id: string }).id).toBe("d1");
  });
});

/**
 * EP-fs-tg：TG 会话下 Tab 行渲染为原生分段选择器（`Segmented`，role=tablist/tab），
 * web 下划线 Tab 行不出现；切换行为不变。判别点选 ARIA role——两个分支渲染的都是
 * 「盘/化解/添置」三枚按钮，只看文字分不出来（恒真断言），role 是严格可区分的：
 * web 分支的按钮没有 tab 语义。
 *
 * 变异验证（实跑过）：把 page.tsx 里的 `inTg` 改成恒 false，本 describe 前两条全红；
 * 把 Cell 的 chevron 改回无条件渲染（评审 M2 的反向变异），「化解清单无 chevron」
 * 那条断言变红。
 */
describe("EP-fs-tg TG 会话：原生分段 Tab + 原生化解清单", () => {
  beforeEach(() => {
    tgEnv.inTg = true;
  });

  it("Tab 行渲染为 tablist（三枚 tab），且 tab↔tabpanel 契约配对完整（评审 M4）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs.map((x) => x.textContent)).toEqual(["盘", "化解", "添置"]);
    // 当前选中的 tab 有 aria-selected，roving tabindex（选中 0，其余 -1）
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
    // aria-controls 必须指向真实存在的 tabpanel。面板按当前 tab 条件渲染，
    // 所以只有**选中那枚**的 aria-controls 当场可解析；逐枚点开验证其余。
    for (const tb of tabs) {
      expect(tb.getAttribute("aria-controls")).toBeTruthy();
      fireEvent.click(tb);
      const panel = screen.getByRole("tabpanel");
      expect(panel).toHaveAttribute("id", tb.getAttribute("aria-controls"));
      expect(panel).toHaveAttribute("aria-labelledby", tb.id);
    }
  });

  it("方向键漫游：ArrowRight 切到下一枚 tab 并移动焦点（评审 M4）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    const tabs = screen.getAllByRole("tab");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(document.activeElement).toBe(tabs[1]);
    // 化解面板成为当前 panel
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "fs-panel-remedy");
    // 到头回绕：从「添置」再 ArrowRight 回到「盘」
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true");
  });

  it("切 tab 行为在原生分段上照常工作（化解 tab 出清单）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.queryByText("可做的事")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "化解" }));
    expect(screen.getByText("可做的事")).toBeInTheDocument();
    // 评审 M2：化解清单的 Cell 没有 onClick → **不应**出现 chevron（它暗示可点）。
    // 这条断言是「chevron 条件渲染」的反向守卫——改回无条件渲染时它变红。
    expect(screen.queryAllByText("›")).toHaveLength(0);
    // 原生分支判别依据（换掉 chevron 之后）：TG 的 Cell 副标题把成本与证据标注合成
    // 一行「零成本 · 传统象征」；web 分支是两个独立 span 夹一个「·」span，没有任何
    // 元素的直接文本节点能拼出这整行——getByText 只拼直接文本节点，两个分支因此
    // 严格可分。同一组合可能出现在多条化解上，按组合聚合计数。
    const combos = new Map<string, number>();
    for (const r of fs.remedies) {
      const key = `${r.effort} · ${r.evidence === "传统象征" ? "传统象征" : "传统 + 现代"}`;
      combos.set(key, (combos.get(key) ?? 0) + 1);
      expect(screen.getByText(r.action)).toBeInTheDocument();
    }
    for (const [key, n] of combos) {
      expect(screen.getAllByText(key)).toHaveLength(n);
    }
  });

  it("web 分支（对照组）：无 tablist，仍是下划线按钮，且**没有 tabpanel**", async () => {
    tgEnv.inTg = false;
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("button", { name: "化解" })).toBeInTheDocument();
    // 复审必修 A 的反向守卫：tabpanel 属性必须按 inTg 门控。web 上没有 tablist/tab，
    // 出现 tabpanel 意味着 aria-labelledby 悬空（指向任何状态下都不存在的 id），
    // 是无障碍回归 + 「web 零变化」红线的双重破坏。只断言 tablist 为 null 抓不到它。
    expect(screen.queryAllByRole("tabpanel")).toHaveLength(0);
    expect(document.getElementById("fs-panel-chart")).toBeNull();
  });
});

/**
 * 2026-08 设计评审后续（feat/fengshui-ui）：首揭仪式（创意 B/P1）、盘即导航（创意 A）、
 * 剪影付费墙（创意 C）。
 *
 * 判别力说明：
 * - remedyDirection 的期望值全部是字面量（评审 C2：旧版从被测函数自身推导期望值，
 *   「先长后短」倒过来也全绿）；盘即导航的 dir/锚点断言同样写死，不碰 SUT；
 * - 盘即导航的过滤断言建立在「别的方位的化解不可见」上——过滤被删掉（变异）时必红；
 * - 剪影断言查「无星名/卦字文字 + 8 占位块」——把真实宅盘数据塞进去（变异）时必红；
 * - I1 的「切走再切回不重放」同时守两端：首揭中 delay 必须在（变异 C 红），
 *   切回后 delay 必须不在（去掉 staggerIn 复位红）。
 */
describe("2026-08 设计评审后续", () => {
  it("首揭仪式：首次进入播 CastingOverlay（seal=境），同会话同一档案不重复播", async () => {
    sessionStorage.removeItem("zj.fsReveal.p1");
    const first = await renderPage();
    await waitFor(() => expect(screen.getByText("正在起你的八方盘")).toBeInTheDocument());
    first.unmount();
    // 同会话第二次进入：不再播
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.queryByText("正在起你的八方盘")).toBeNull();
  });

  it("remedyDirection 字面量断言：先长后短（中文方位名子串陷阱，评审 C2）", async () => {
    const { remedyDirection } = await import("../page");
    // 长短同前缀两对：「东」⊂「东南」、「北」⊂「东北」。先短后长的实现会把
    // 「东南（生气方）」错配成 E——这些字面量断言是变异 A 的守卫，必须变红。
    expect(remedyDirection("东南（生气方）")).toBe("SE");
    expect(remedyDirection("东（天医方）")).toBe("E");
    expect(remedyDirection("东北（五鬼方）")).toBe("NE");
    expect(remedyDirection("北（伏位方）")).toBe("N");
    expect(remedyDirection("西南（绝命方）")).toBe("SW");
    // 与方位无关的化解（宜用色与材/物件类）→ null，过滤时归入「不限方位」组
    expect(remedyDirection("形煞 / 屋内杂乱")).toBeNull();
  });

  it("盘即导航：点本命盘扇区 → 切化解 tab、按方位过滤、方位锚点显示期望标签、不限方位组保留、清除后恢复全量", async () => {
    // 评审 C2：期望值一律写死，绝不再从被测函数 remedyDirection 推导（旧实现
    // `dir = remedyDirection(directional[0].target)` 让任何映射错误都自洽、不可见——
    // 评审把「先长后短」倒过来跑，69/69 全绿，而生产里点东南扇区会得到
    // 「这个方位暂时没有对应的化解」）。fixture（1990-06-15 男 = 坎1）的带方位
    // 化解只有这三条：
    const TARGET_TO_DIRECTION: Record<string, "SE" | "E" | "SW"> = {
      "东南（生气方）": "SE",
      "东（天医方）": "E",
      "西南（绝命方）": "SW",
    };
    // 前提校验：fixture 结构没变（变了就光明正大失败，而不是悄悄失去判别力）
    const directional = fs.remedies.filter((r) => r.target in TARGET_TO_DIRECTION);
    const general = fs.remedies.filter((r) => !(r.target in TARGET_TO_DIRECTION));
    expect(directional).toHaveLength(3);
    expect(general.length).toBeGreaterThan(0);

    const dir = "SE" as const;
    const seRemedies = directional.filter((r) => TARGET_TO_DIRECTION[r.target] === dir);
    const elsewhere = directional.filter((r) => TARGET_TO_DIRECTION[r.target] !== dir);
    expect(seRemedies.length).toBeGreaterThan(0);
    expect(elsewhere.length).toBeGreaterThan(0);

    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());

    // 点扇区（扇区的可访问名 = aria-label「东南：生气（吉）」格式）
    const v = fs.personalDirections[dir];
    fireEvent.click(
      screen.getByRole("button", { name: `${DIRECTION_LABEL[dir]}：${v.star}（${v.auspicious ? "吉" : "凶"}）` }),
    );

    // 跳到化解 tab + 过滤条出现
    await waitFor(() => expect(screen.getByText("可做的事")).toBeInTheDocument());
    expect(screen.getByText(`只看${DIRECTION_LABEL[dir]}方`)).toBeInTheDocument();

    // 该方位的化解可见；其他方位的化解不可见；不限方位的仍列在通用组
    for (const r of seRemedies) {
      expect(screen.getByText(r.action)).toBeInTheDocument();
    }
    for (const r of elsewhere) {
      expect(screen.queryByText(r.action)).toBeNull();
    }
    expect(screen.getByText("不限方位")).toBeInTheDocument();
    expect(screen.getByText(general[0]!.action)).toBeInTheDocument();

    // 评审 C2 第 3 条：web 臂化解行行首的方位锚点（朱砂宋体方向字）必须显示
    // **期望的**方位标签——「东南（生气方）」→「东南」。必须精确匹配：中文方位名
    // 互为子串（北⊂东北、东⊂东南），模糊匹配抓不到错配。删掉锚点（变异 B）
    // 或渲染错方位标签时这条变红。
    const seRow = screen.getByText(seRemedies[0]!.action).closest("li")!;
    const anchor = within(seRow).getByText("东南", { exact: true });
    expect(anchor.getAttribute("style")).toContain("var(--color-cinnabar)");

    // 清除筛选 → 全量恢复
    fireEvent.click(screen.getByText("清除筛选"));
    for (const r of fs.remedies) {
      expect(screen.getByText(r.action)).toBeInTheDocument();
    }
  });

  it("盘即导航：再点同一扇区取消过滤（selectDirection 的注释承诺，评审 Minor——此前零覆盖）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    const v = fs.personalDirections.SE;
    const sectorName = `东南：${v.star}（${v.auspicious ? "吉" : "凶"}）`;
    const swAction = fs.remedies.find((r) => r.target === "西南（绝命方）")!.action;

    // 第一次点：过滤生效（西南的化解被筛掉）
    fireEvent.click(screen.getByRole("button", { name: sectorName }));
    await waitFor(() => expect(screen.getByText("只看东南方")).toBeInTheDocument());
    expect(screen.queryByText(swAction)).toBeNull();

    // 切回命盘 tab，再点同一扇区：过滤清除（且不再跳回化解 tab）
    fireEvent.click(screen.getByRole("button", { name: "盘" }));
    await waitFor(() => expect(screen.getByRole("button", { name: sectorName })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: sectorName }));

    // 回到化解 tab：过滤条消失，完整列表恢复（含西南那条）
    fireEvent.click(screen.getByRole("button", { name: "化解" }));
    await waitFor(() => expect(screen.getByText("可做的事")).toBeInTheDocument());
    expect(screen.queryByText("只看东南方")).toBeNull();
    for (const r of fs.remedies) {
      expect(screen.getByText(r.action)).toBeInTheDocument();
    }
  });

  it("首揭仪式错峰只播一次：点扇区切走再切回命盘 tab 不重放（评审 I1）", async () => {
    sessionStorage.removeItem("zj.fsReveal.p1");
    await renderPage();
    await waitFor(() => expect(screen.getByText("正在起你的八方盘")).toBeInTheDocument());

    // 首揭进行中：扇区带错峰 animationDelay（staggerIn=true 确实接到了盘上）。
    // 这条同时是变异 C（调用点硬编码 staggerIn={false}）的守卫——那样首揭就
    // 不再错峰，本断言变红。
    const v = fs.personalDirections.SE; // 生气方，rank 1 → delay 0ms
    const sectorName = `东南：${v.star}（${v.auspicious ? "吉" : "凶"}）`;
    expect(screen.getByLabelText(sectorName).style.animationDelay).toBe("0ms");

    // 揭示结束：2100ms 定时器统一复位 revealing + staggerIn。用真实等待——
    // 定时器在挂载时已按真实时钟排定，事后再开 fake timers 接管不到它；
    // revealing/staggerIn 在同一个 setTimeout 回调里复位，overlay 消失即两者都已落定。
    await waitFor(() => expect(screen.queryByText("正在起你的八方盘")).toBeNull(), { timeout: 4000 });

    // 点扇区 → 化解 tab（盘随之卸载）
    fireEvent.click(screen.getByRole("button", { name: sectorName }));
    await waitFor(() => expect(screen.getByText("可做的事")).toBeInTheDocument());

    // 切回命盘 tab：盘重新挂载，staggerIn 必须已复位——扇区不再带错峰 delay。
    // 没有这条复位（I1 的 bug），这里会是无过场解释的第二次错峰淡入。
    fireEvent.click(screen.getByRole("button", { name: "盘" }));
    await waitFor(() => expect(screen.getByLabelText(sectorName)).toBeInTheDocument());
    expect(screen.getByLabelText(sectorName).style.animationDelay).toBe("");
  });

  it("剪影付费墙：非会员看到去色剪影（无吉凶数据）+ Paywall，而非纯文字墙", async () => {
    dwellingsFixture.current = [dwellingL1(["p2"])];
    vi.stubGlobal(
      "fetch",
      methodRouter({
        GET: () => jsonResponse({ entitled: false }),
        POST: () => jsonResponse({ sections: SECTIONS, degraded: false }),
      }),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText("升级会员，解锁无限")).toBeInTheDocument());

    const silhouette = screen.getByTestId("bagua-silhouette");
    // 「看不清内容」：无星名、无方位名、无卦字（EP-east-ui-r2：盘上内容物已从
    // 扇区+星名 pill 变为卦字，泄漏面随之改查卦字）
    expect(silhouette.textContent).not.toContain("生气");
    expect(silhouette.textContent).not.toContain("南");
    expect(silhouette.textContent).not.toContain("乾");
    expect(silhouette.textContent).not.toContain("坎");
    // 「看得见形状」：八个卦字占位块结构在
    expect(silhouette.querySelectorAll("rect")).toHaveLength(8);
    // 真宅盘仍未渲染（剪影不是后门）
    expect(screen.queryByLabelText("房屋八方吉凶盘")).toBeNull();
  });
});

/**
 * 对照设计稿（frontend-harness 审查，2026-08-18）：
 * - #4 有朝向已知的居所时，主视觉从「本命八方」倒向「居所的方位」（居所先出现、
 *   本命八方降为第二段；没有居所时维持原有顺序）；
 * - #6 一句话基调（确定性，见 packages/core 的 deriveFengshuiTagline 专属测试）
 *   默认可见，「展开完整解读」才挂载 situation/youAndSpace 长文。
 *
 * 一句话基调的期望值不是在测试里现调 deriveFengshuiTagline 算出来的（那样期望值
 * 来自被测函数自己，抓不到映射错误）——是拿本文件的 fixture（1990-06-15 14:30
 * 男）单独跑一次那个函数、把真实输出摘出来固定在这里，跟本文件别处硬编码
 * "坎1" 这类真实计算结果是同一个纪律。
 */
describe("评审后续 #4/#6：主视觉顺序反转 + 一句话基调", () => {
  const TAGLINE = "金命之人，宜近土——你的生气在东南。";

  it("没有居所时：一句话基调始终可见，且排在「本命八方」标题之前（顶替原先叙述长文的首屏位置）", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText(TAGLINE)).toBeInTheDocument());
    const personalHeading = screen.getByText("本命八方");
    const tagline = screen.getByText(TAGLINE);
    const pos = tagline.compareDocumentPosition(personalHeading);
    expect(pos & Node.DOCUMENT_POSITION_FOLLOWING, "「本命八方」应排在一句话基调之后").toBeTruthy();
  });

  it("有朝向已知的居所时：页头改「居所的方位」+ 坐向宅卦副标题；居所盘 → 一句话基调 → 本命八方，三者按此顺序出现", async () => {
    dwellingsFixture.current = [dwellingL1()]; // 向南 → 坐北 → 坎宅
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎宅")).toBeInTheDocument());

    // 页头（评审后续 #4：claude 判断的可行方案——只在有居所可看时才倒，不是全局倒置）
    expect(screen.getByText("居所的方位")).toBeInTheDocument();
    expect(screen.getByText("坐北朝南 · 坎宅")).toBeInTheDocument();
    expect(screen.queryByText("境")).toBeNull(); // 通用标题被居所标题取代，不是并存

    const dwellingHeading = screen.getByText("房屋八方");
    const tagline = screen.getByText(TAGLINE);
    const personalHeading = screen.getByText("本命八方");

    const p1 = dwellingHeading.compareDocumentPosition(tagline);
    expect(p1 & Node.DOCUMENT_POSITION_FOLLOWING, "一句话基调应排在「房屋八方」之后").toBeTruthy();
    const p2 = tagline.compareDocumentPosition(personalHeading);
    expect(p2 & Node.DOCUMENT_POSITION_FOLLOWING, "「本命八方」应排在一句话基调之后（降级为第二段，不是被删）").toBeTruthy();

    // 降级不等于删除：完整的本命盘信息仍然都在（两个盘同屏共存，各自的
    // accessible label 不同，能分得清是哪一张——不是宅盘顶替了本命盘）。
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    expect(screen.getByLabelText("房屋八方吉凶盘")).toBeInTheDocument();
  });

  it("展开/收起是真的开关：默认收起（长文不在 DOM 里），点一次展开、再点一次收起，长文随之挂载/卸载", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("展开完整解读 →")).toBeInTheDocument());
    expect(screen.queryByText("甲")).toBeNull();

    expandNarrative();
    expect(screen.getByText("甲")).toBeInTheDocument();
    expect(screen.getByText("收起 ↑")).toBeInTheDocument();

    fireEvent.click(screen.getByText("收起 ↑"));
    expect(screen.queryByText("甲")).toBeNull();
    expect(screen.getByText("展开完整解读 →")).toBeInTheDocument();
  });

  it("回归防护：degraded 时可信度提示与重新生成入口即使在默认收起状态下也必须可见——\n" +
     "这是本次实现里唯一真出过的行为回归（第一版把整个 NarrativeStatus 塞进折叠条件里，\n" +
     "degraded/failed 的提示被连带藏了，20 条既有测试当场发现），补一条测试钉死不许再犯。", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: true })));
    await renderPage();
    // 不点「展开」——就要在默认（收起）状态下看到 degraded 提示与重试入口。
    await waitFor(() => expect(screen.getByText(/系统纠正/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "重新生成叙述" })).toBeInTheDocument();
    // 「展开」按钮本身在 degraded 时不出现（没有可展开的可信内容），
    // 不能跟「degraded 提示被隐藏」混为一谈。
    expect(screen.queryByText("展开完整解读 →")).toBeNull();
  });
});
