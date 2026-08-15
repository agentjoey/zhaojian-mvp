import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart, computeFengshui } from "@eamvp/core";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import { ObjectAdvisorForm } from "../ObjectAdvisorForm";

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const fs = computeFengshui({ birth, chart: computeUnifiedChart(birth) });

function Wrapper({ children, locale = "zh" as const }: { children: React.ReactNode; locale?: "zh" | "en" }) {
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("放东边靠墙就好。")));
});

/**
 * EP-fs-08 物件顾问表单。建议本身（推荐方位 / 不宜方位 / 品类规则 / 与你的关系）
 * 完全由 `adviseObject`（core 纯函数）在客户端确定性算出；LLM 只把结果润色成
 * 2–3 句人话，失败不影响可用性 —— 这是本组件与「境」主页面共享的降级原则。
 */
describe("EP-fs-08 物件顾问表单", () => {
  it("提交后给出确定性建议（推荐方位与品类规则）", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.getByText("这类物件的讲究")).toBeInTheDocument();
  });

  it("镜子显示「不对床」规则", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "mirror" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText(/不正对床/)).toBeInTheDocument());
  });

  it("LLM 失败时确定性结果仍完整显示", async () => {
    const fetchMock = vi.fn(async () => new Response("x", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    // 确定性结果由 submit() 同步 setAdvice() 算出，点击那一刻就已经在 DOM 里——
    // 所以「推荐方位」在 fetch 的 503 响应被处理前就已可见，光 waitFor 一次极易在
    // 第一次同步检查就通过而根本没等 .then()/.catch() 跑完，测不出「失败路径是否
    // 反而把已有结果清空」这类回归（曾实测：故意让失败分支 setAdvice(null)，
    // 这里若不显式等待该异步链路落定，测试仍会绿）。显式等 fetch 被调用、
    // 再把它返回的 promise 走完（与组件内部 `.then` 挂在同一个 promise 上，
    // 按调用顺序，组件的 `.then` 先挂上、必定先于这里的 await 结算），
    // 才断言确定性结果仍完整——这才是这条用例名字承诺的东西。
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => { await fetchMock.mock.results[0]!.value; });
    expect(screen.getByText("推荐方位")).toBeInTheDocument();
    expect(screen.getByText("这类物件的讲究")).toBeInTheDocument();
    expect(screen.getByText("不宜方位")).toBeInTheDocument();
    expect(screen.getByText("与你的关系")).toBeInTheDocument();
  });

  // 补充：brief 给的三条只覆盖「品类规则」一个确定性板块；「不宜方位」与「与你的关系」
  // 是另外两个独立渲染分支，各自都可能被误删而不被上面三条测试察觉，需要单独锁定。
  it("不宜方位与与你的关系两个板块也一并渲染", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("不宜方位")).toBeInTheDocument());
    expect(screen.getByText("与你的关系")).toBeInTheDocument();
  });

  // "金属" 是 core `MATERIAL_ELEMENT` 表里字面登记的键，对应五行"金"——直接取自
  // packages/core/src/fengshui/object-advisor.ts 源码，不经过在测试里再调用一次
  // adviseObject() 来"自证"期望值。
  it("选定材质后按五行对照表显示物件五行", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.change(screen.getByLabelText("材质"), { target: { value: "金属" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("物件五行：金")).toBeInTheDocument());
  });

  it("未指定摆放方位时不显示「你想放的位置」；指定后才显示", async () => {
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: Wrapper });
    fireEvent.change(screen.getByLabelText("品类"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("推荐方位")).toBeInTheDocument());
    expect(screen.queryByText("你想放的位置")).toBeNull();

    fireEvent.change(screen.getByLabelText("打算放在"), { target: { value: "N" } });
    fireEvent.click(screen.getByText("看看放哪儿好"));
    await waitFor(() => expect(screen.getByText("你想放的位置")).toBeInTheDocument());
  });

  // 「境」主页面（page.tsx）请求 /api/fengshui/reading 时带 x-zj-locale 头，物件顾问
  // 走同一条约定；这里直接断言请求头，而不是断言润色文案本身的语言（那要靠 LLM，
  // 本组件对此没有决定权），避免测出一个组件管不到的东西。
  it("提交请求带上 x-zj-locale 头，随当前 locale 变化", async () => {
    const fetchMock = vi.fn<(...args: [RequestInfo | URL, RequestInit?]) => Promise<Response>>(
      async () => new Response("ok"),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<ObjectAdvisorForm fs={fs} />, { wrapper: (p) => <Wrapper {...p} locale="en" /> });
    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "desk" } });
    fireEvent.click(screen.getByText("Find a good spot"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/fengshui/object");
    expect(init!.headers).toMatchObject({ "x-zj-locale": "en" });
  });
});
