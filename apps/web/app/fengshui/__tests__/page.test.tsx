import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, FENGSHUI_ENGINE_VERSION } from "@eamvp/core";
import { fengshuiCacheKey } from "@/lib/fengshui-cache";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

/** 三分节报告桩数据；"甲"/"乙"/"丙" 是仅在叙述里出现的独有标记字符，用来断言「叙述本体是否被渲染」。 */
const NARRATIVE = "## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n";
const CACHE_KEY_ZH = fengshuiCacheKey("p1", FENGSHUI_ENGINE_VERSION, "zh");

vi.mock("@/lib/profiles", () => ({ getActiveProfile: vi.fn(async () => profile) }));
vi.mock("@/lib/tg/client", () => ({ hasTgSession: () => false, tgGetProfile: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/fengshui" }));

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
 */
async function renderPage(locale: "zh" | "en" = "zh") {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider locale={locale}>{children}</I18nProvider>;
  }
  return render(<Page />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "1");
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(NARRATIVE)));
});

describe("EP-fs-07 /fengshui Layer 0", () => {
  it("渲染命卦、八方盘与化解清单", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    expect(screen.getByText("可做的事")).toBeInTheDocument();
    // 未降级的正常路径下，叙述本体应当照常渲染（与 degraded 测试「queryByText("甲") 为 null」形成对照）；
    // 顺带把这个 await 落在测试末尾，让叙述 fetch 的 .then 在测试结束前完整跑完，
    // 避免它在下一条测试执行期间才 resolve、产生 act() 警告。
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
  });

  it("LLM 失败时仍渲染盘与化解，并显示降级提示", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    await renderPage();
    // 等失败提示本身（真正依赖 fetch reject → setFailed 落定），而不是拿盘图当代理——
    // 盘图不依赖这次 fetch、在 fetch 的 .catch 跑完前就已经渲染出来，两者不是同一时刻发生，
    // 拿盘图当 waitFor 目标会让下面这句偶发地抢在 setFailed 生效前执行（本次改造前就已实测翻车一次）。
    await waitFor(() => expect(screen.getByText(/叙述暂时生成不出来/)).toBeInTheDocument());
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
  });

  it("flag 关闭时显示未开启文案，不渲染盘", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    await renderPage();
    expect(screen.getByText("「境」尚未开启。")).toBeInTheDocument();
    expect(screen.queryByLabelText("八方吉凶盘")).toBeNull();
  });

  it("每条化解带「和 Mira 聊聊这条」链接指向 /spirit", async () => {
    await renderPage();
    // 等叙述结算完（而非只等盘图），让本测试内该请求的 .then 在测试结束前跑完，避免遗留到下一条测试才 resolve。
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
    const links = screen.getAllByText("和 Mira 聊聊这条");
    expect(links[0]!.closest("a")!.getAttribute("href")).toMatch(/^\/spirit\?topic=fengshui:/);
  });
});

describe("EP-fs-07 /fengshui Layer 0 — 报告缓存", () => {
  it("成功且未降级时叙述正常渲染，并写入 localStorage 缓存供下次直读", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
    expect(localStorage.getItem(CACHE_KEY_ZH)).toBe(NARRATIVE);
  });

  it("已有缓存时直接读取渲染，不发起网络请求", async () => {
    localStorage.setItem(CACHE_KEY_ZH, "## 形势\n缓存内容\n");
    const fetchSpy = vi.fn(async () => new Response("不该被调用到"));
    vi.stubGlobal("fetch", fetchSpy);
    await renderPage();
    // 等真正依赖该异步分支的内容（缓存文本），而不是拿盘图（同步可得、不依赖缓存分支）当代理——
    // 后者会在缓存读取的 effect 真正落定前就先满足，产生间歇性通过的假阳性。
    await waitFor(() => expect(screen.getByText("缓存内容")).toBeInTheDocument());
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("EP-fs-07 /fengshui Layer 0 — degraded 报告的消费", () => {
  it("方位纠正导致 degraded 时：不直接渲染叙述、给出可见可信度提示、且不写入缓存", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(NARRATIVE, { status: 200, headers: { "X-Fengshui-Degraded": "1" } })),
    );
    await renderPage();
    // 等待可信度提示本身（真正依赖 fetch → setDegraded 那条异步链路落定的内容），
    // 而不是拿盘图当代理——盘图渲染不依赖这次 fetch，会在 fetch 回调跑完前就已存在，
    // 导致这里的断言在 setDegraded/setNarrative 生效前就执行、间歇性通过。
    await waitFor(() => expect(screen.getByText(/系统纠正/)).toBeInTheDocument());

    // 确定性内容不受影响
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    expect(screen.getByText("可做的事")).toBeInTheDocument();
    // 叙述本体（含被机械纠正过星名、但周边论述仍可能建立在错误方位上）不能被当作正常结果直接渲染
    expect(screen.queryByText("甲")).toBeNull();
    // 不可信叙述不落盘缓存，避免一份带瑕疵的报告被永久复用
    expect(localStorage.getItem(CACHE_KEY_ZH)).toBeNull();
  });

  it("未降级（X-Fengshui-Degraded 为 0）时不显示可信度提示", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(NARRATIVE, { status: 200, headers: { "X-Fengshui-Degraded": "0" } })),
    );
    await renderPage();
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
    expect(screen.queryByText(/系统纠正/)).toBeNull();
  });
});

describe("EP-fs-07 /fengshui Layer 0 — 英文 locale", () => {
  it("locale=en 时化解清单成本标签走 i18n 翻译，不泄漏中文原文", async () => {
    await renderPage("en");
    // 等叙述结算（内容本身仍是 mock 的中文占位符，与本测试无关；只是借它确保测试结束前
    // 该请求的 .then 已经跑完，不遗留到下一条测试才 resolve、触发 act() 警告）。
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
    // fs-desk-sheng（生气方书桌建议）恒为 buildPersonalRemedies 输出的第一条、effort 恒为「零成本」
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.queryByText("零成本")).toBeNull();
  });
});
