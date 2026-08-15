import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, computeFengshui, FENGSHUI_ENGINE_VERSION } from "@eamvp/core";
import { fengshuiCacheKey } from "@/lib/fengshui-cache";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };
// 与 page.tsx 内部完全相同的计算（birth + chart 一致），用来独立算出 fs.remedies 的真实
// 顺序与内容，而不是靠猜测某条化解「恒为第一条」——那类假设已经在最终评审 Blocking 2
// 的排查中被证明不可靠（sortRemedies 的实际结果并不是本文件旧注释所声称的那样）。
const fs = computeFengshui({ birth, chart: profile.chart });

/**
 * 三分节报告桩数据（Task 14 复审后：route 契约改为 JSON，客户端直接消费已切好的
 * `sections`，不再自己从 markdown 里找 `## ` 分节）。"甲"/"乙"/"丙" 是仅在叙述里
 * 出现的独有标记字符，用来断言「叙述本体是否被渲染」。
 */
const SECTIONS = { situation: "甲", youAndSpace: "乙", actions: "丙" };
const CACHE_KEY_ZH = fengshuiCacheKey("p1", FENGSHUI_ENGINE_VERSION, "zh");

/** route 现在返回 JSON（`{ sections, degraded }`），而不是纯 markdown 文本 + 自定义响应头。 */
function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

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
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: false })));
});

describe("EP-fs-07 /fengshui Layer 0", () => {
  it("渲染命卦、八方盘、三分节叙述标题与化解清单", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("坎1")).toBeInTheDocument());
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    // "可做的事" 只应出现一次：叙述第三节与确定性化解清单共用同一个标题
    // （复审必修1的分节渲染方案——避免两个标题字面重复地堆在页面上）。
    // 未降级的正常路径下，叙述本体应当照常渲染（与 degraded 测试「queryByText("甲") 为 null」形成对照）；
    // 顺带把这个 await 落在测试末尾，让叙述 fetch 的 .then 在测试结束前完整跑完，
    // 避免它在下一条测试执行期间才 resolve、产生 act() 警告。
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
    expect(screen.getByText("可做的事")).toBeInTheDocument();
    expect(screen.getByText("乙")).toBeInTheDocument();
    // 复审必修1核心回归：三个 H2 标题必须走 i18n 渲染成真正的标题元素，
    // 绝不能把 "## 形势" 这种字面 markdown 语法原样打印到页面上。
    expect(screen.getByText("形势")).toBeInTheDocument();
    expect(screen.getByText("境与你")).toBeInTheDocument();
    expect(screen.queryByText(/##/)).toBeNull();
    // 叙述分节标题不得借用描述确定性区块的键（八方吉凶 / 宜用色与材），二者语义不同
    expect(screen.queryByText("八方吉凶")).toBeNull();
    expect(screen.queryByText("宜用色与材")).toBeNull();
  });

  it("LLM 失败时仍渲染盘与化解，并显示降级提示", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));
    await renderPage();
    // 等失败提示本身（真正依赖 fetch reject → setFailed 落定），而不是拿盘图当代理——
    // 盘图不依赖这次 fetch、在 fetch 的 .catch 跑完前就已经渲染出来，两者不是同一时刻发生，
    // 拿盘图当 waitFor 目标会让下面这句偶发地抢在 setFailed 生效前执行（本次改造前就已实测翻车一次）。
    await waitFor(() => expect(screen.getByText(/叙述暂时生成不出来/)).toBeInTheDocument());
    expect(screen.getByLabelText("八方吉凶盘")).toBeInTheDocument();
    expect(screen.getByText("可做的事")).toBeInTheDocument();
  });

  it("flag 关闭时显示未开启文案，不渲染盘", async () => {
    vi.stubEnv("NEXT_PUBLIC_FENGSHUI_ENABLED", "");
    await renderPage();
    expect(screen.getByText("「境」尚未开启。")).toBeInTheDocument();
    expect(screen.queryByLabelText("八方吉凶盘")).toBeNull();
  });

});

describe("最终评审 Blocking 2：「和 Mira 聊聊这条」链接要带得动实际内容，且受「灵」flag 门控", () => {
  // 复审指出：此前 href 只带 remedyId（如 `?topic=fengshui:fs-desk-sheng`），
  // /spirit 只认 topic==="portrait"，id 被解析出来即丢弃，用户落进空白通用聊天——
  // 是「复用了 URL 形状，没复用机制」。下面的测试断言行为（q 参数真的带着这条化解
  // 的动作文本、灵关闭时链接压根不存在），不再只断言 href 正则（那样的断言即使
  // /spirit 端完全不解析这个 id 也照样通过，抓不住这个 bug）。

  it("灵开启时，每条化解链接指向 /spirit?topic=fengshui&q=<那一条自己的动作文本>（不是无意义的 id）", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
    const { truncateForSpiritQuery } = await import("../page");
    await renderPage();
    // 等叙述结算完（而非只等盘图），让本测试内该请求的 .then 在测试结束前跑完，避免遗留到下一条测试才 resolve。
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
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
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
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
  it("成功且未降级时叙述正常渲染，并写入 localStorage 缓存供下次直读", async () => {
    await renderPage();
    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem(CACHE_KEY_ZH) ?? "null")).toEqual(SECTIONS);
  });

  it("已有缓存时直接读取渲染，不发起网络请求", async () => {
    localStorage.setItem(CACHE_KEY_ZH, JSON.stringify({ situation: "缓存内容", youAndSpace: "y", actions: "a" }));
    const fetchSpy = vi.fn(async () => new Response("不该被调用到"));
    vi.stubGlobal("fetch", fetchSpy);
    await renderPage();
    // 等真正依赖该异步分支的内容（缓存文本），而不是拿盘图（同步可得、不依赖缓存分支）当代理——
    // 后者会在缓存读取的 effect 真正落定前就先满足，产生间歇性通过的假阳性。
    await waitFor(() => expect(screen.getByText("缓存内容")).toBeInTheDocument());
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
    expect(localStorage.getItem(CACHE_KEY_ZH)).toBeNull();
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
    expect(screen.getByText("可做的事")).toBeInTheDocument();
    // 叙述本体（含被机械纠正过星名、但周边论述仍可能建立在错误方位上）不能被当作正常结果直接渲染
    expect(screen.queryByText("甲")).toBeNull();
    // 不可信叙述不落盘缓存，避免一份带瑕疵的报告被永久复用
    expect(localStorage.getItem(CACHE_KEY_ZH)).toBeNull();
  });

  it("未降级（degraded: false）时不显示可信度提示", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: false })));
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

describe("EP-fs-07 /fengshui Layer 0 — 缓存键的判别力（Task 14 复审必修3）", () => {
  // 现有测试此前的期望值全部由 fengshuiCacheKey 自己算出来，属于自证——
  // 把 locale/engineVersion 从缓存键公式里删掉，那些测试照样全绿。这里改用
  // 「预先在另一把键下塞入缓存，断言运行时确实没有命中它、fetch 确实被调用」
  // 的写法，只要 fengshuiCacheKey 的输出不再随该参数变化，这两条测试就会变红。

  it("locale 切换后不会读到旧语言缓存：zh 缓存已存在，仍以 locale=en 渲染时应发起新请求", async () => {
    const staleZhKey = fengshuiCacheKey("p1", FENGSHUI_ENGINE_VERSION, "zh");
    localStorage.setItem(staleZhKey, JSON.stringify({ situation: "旧中文缓存", youAndSpace: "y", actions: "a" }));

    const fetchSpy = vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: false }));
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage("en");

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    // 顺带确认没有误读旧语言缓存的内容
    expect(screen.queryByText("旧中文缓存")).toBeNull();
  });

  it("引擎版本变化后不会读到旧版本缓存：非当前版本的键已存在，仍应发起新请求", async () => {
    const staleVersionKey = fengshuiCacheKey("p1", "not-the-current-engine-version", "zh");
    localStorage.setItem(staleVersionKey, JSON.stringify({ situation: "旧引擎版本缓存", youAndSpace: "y", actions: "a" }));

    const fetchSpy = vi.fn(async () => jsonResponse({ sections: SECTIONS, degraded: false }));
    vi.stubGlobal("fetch", fetchSpy);

    await renderPage("zh");

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.queryByText("旧引擎版本缓存")).toBeNull();
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

    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
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

    await waitFor(() => expect(screen.getByText("甲")).toBeInTheDocument());
    expect(screen.queryByText(/叙述暂时生成不出来/)).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("EP-fs-07 /fengshui Layer 0 — locale 切换时的状态重置与竞态保护（Task 14 复审顺带修）", () => {
  it("上一语言遗留的 degraded 不会残留：切到已有可信缓存的新语言时，叙述正常显示、不再挂着旧的降级提示", async () => {
    // 复现场景：zh 请求判定 degraded（叙述被隐藏、显示提示），随后用户切到 en——
    // en 恰好已有一份可信缓存。旧代码的缓存命中分支直接 `setNarrative(cached); return;`，
    // 从不重置 `degraded`，于是新语言的可信内容会被上一语言遗留的 `degraded === true` 挡住。
    const keyEn = fengshuiCacheKey("p1", FENGSHUI_ENGINE_VERSION, "en");
    localStorage.setItem(
      keyEn,
      JSON.stringify({ situation: "EN-SITUATION-OK", youAndSpace: "EN-SPACE-OK", actions: "EN-ACTIONS-OK" }),
    );
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

    await waitFor(() => expect(screen.getByText("EN-SITUATION-OK")).toBeInTheDocument());
    // en 的可信缓存应当正常显示，不能被 zh 遗留下来的 degraded 提示挡住
    expect(screen.queryByText(/auto-corrected/)).toBeNull();
  });
});
