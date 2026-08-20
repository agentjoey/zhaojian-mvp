import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent, waitFor } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@eamvp/core";

/**
 * 最终评审 I-1：/dream 页面级 flag 门控。此前 page.tsx 全文不查
 * NEXT_PUBLIC_DREAM_ENABLED，flag 关闭时直接访问 URL 会完整渲染表单
 * （API 层虽有 404，但 spec 要求「/dream 不可达」，且 /fengshui、/spirit
 * 都有页面级 notEnabled 门控）。
 *
 * 已知陷阱（与 app/__tests__/page.test.tsx、spirit/fengshui 测试相同）：
 * page.tsx 顶层 `const ENABLED = process.env.NEXT_PUBLIC_DREAM_ENABLED === "1"`
 * 在**模块加载时**求值，所以必须 `vi.resetModules()` 之后再动态 import；
 * 而 `I18nProvider` 必须出自**同一次**动态 import，否则 `useT()` 拿到的
 * I18nContext 实例与 Wrapper 提供的对不上、直接抛错。
 */

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

const getSpiritMemoryMock = vi.fn(async (..._a: unknown[]): Promise<string | null> => "他最近反复提到换工作的纠结。");
const saveSpiritMemoryMock = vi.fn(async (..._a: unknown[]): Promise<void> => {});
const getQuestionnaireMock = vi.fn(async (..._a: unknown[]): Promise<null> => null);
vi.mock("@/lib/profiles", () => ({
  getActiveProfile: vi.fn(async () => profile),
  getSpiritMemory: (...a: unknown[]) => getSpiritMemoryMock(...a),
  saveSpiritMemory: (...a: unknown[]) => saveSpiritMemoryMock(...a),
  getQuestionnaire: (...a: unknown[]) => getQuestionnaireMock(...a),
}));
const tgEnv = { inTg: false };
const tgListDreamHistoryMock = vi.fn(async (): Promise<{ id: string; summary: string; createdAt: string }[]> => []);
vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => false,
  isTelegram: () => tgEnv.inTg,
  tgGetProfile: vi.fn(),
  tgListDreamHistory: (...a: unknown[]) => tgListDreamHistoryMock(...a),
}));
const spiritMemoryActionMock = vi.fn(async (..._a: unknown[]): Promise<string | null> => null);
const dreamSummaryActionMock = vi.fn(async (..._a: unknown[]): Promise<string | null> => null);
vi.mock("@/app/actions", () => ({
  spiritMemoryAction: (...a: unknown[]) => spiritMemoryActionMock(...a),
  dreamSummaryAction: (...a: unknown[]) => dreamSummaryActionMock(...a),
}));
const listDreamHistoryMock = vi.fn(async (..._a: unknown[]): Promise<{ id: string; summary: string; createdAt: string }[]> => []);
const appendDreamHistoryMock = vi.fn(async (..._a: unknown[]): Promise<void> => {});
vi.mock("@/lib/dream-history", () => ({
  listDreamHistory: (...a: unknown[]) => listDreamHistoryMock(...a),
  appendDreamHistory: (...a: unknown[]) => appendDreamHistoryMock(...a),
}));

/**
 * EP-account2 阻断 3：page.tsx web 臂直接 import `@/lib/supabase`（读会话
 * access_token 附到 /api/spirit/dream 请求头，路由已硬要求 Bearer）。真实实现
 * 在缺 NEXT_PUBLIC_SUPABASE_URL/_ANON_KEY 时抛错，必须 mock。会话内容做成可按
 * 测试改写的共享可变量（vi.hoisted）——renderDreamPage() 每次 resetModules +
 * 动态 import，mock 工厂可能重新执行，直接摆弄 mock 实例会打到旧实例
 * （fengshui/__tests__/page.test.tsx 记过同一个坑，理由同 supabaseSession）。
 * 默认带 token 的会话，让「页面发出的请求形态」有真实对象可断言。
 */
const { supabaseSession } = vi.hoisted(() => ({
  supabaseSession: { current: null as { access_token: string } | null },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: () => ({ auth: { getSession: vi.fn(async () => ({ data: { session: supabaseSession.current } })) } }),
}));

/**
 * `render()` 包一层 `await act(async () => {...})`：page.tsx 挂载时
 * `getActiveProfile().then(setProfile)` 落在真实微任务里，同步 render 返回后
 * setState 可能落在 act 作用域之外（fengshui/__tests__/page.test.tsx 顶部注释
 * 记过同一时序竞争，这里沿用同一解法）。
 */
async function renderDreamPage() {
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

beforeEach(() => {
  vi.resetModules();
  tgEnv.inTg = false;
  supabaseSession.current = { access_token: "test-access-token" };
  vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
  getSpiritMemoryMock.mockClear();
  saveSpiritMemoryMock.mockClear();
  getQuestionnaireMock.mockClear();
  spiritMemoryActionMock.mockClear();
  dreamSummaryActionMock.mockClear();
  listDreamHistoryMock.mockClear();
  listDreamHistoryMock.mockResolvedValue([]);
  appendDreamHistoryMock.mockClear();
  tgListDreamHistoryMock.mockClear();
  vi.unstubAllGlobals();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  delete window.Telegram;
});

describe("最终评审 I-1：/dream 页面级 flag 门控", () => {
  it("flag 开：渲染解梦输入表单（textarea 在场）", async () => {
    await renderDreamPage();
    // 等 profile 加载完、早退（return null）结束后表单出现
    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("说说你的梦")).toBeInTheDocument();
    expect(screen.queryByText("「解梦」尚未开启。")).toBeNull();
  });

  it("flag 关：渲染 notEnabled 文案，且没有 textarea", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    await renderDreamPage();
    expect(screen.getByText("「解梦」尚未开启。")).toBeInTheDocument();
    // 只查文案抓不住「文案与表单同时渲染」这种改法——表单本体必须一并不存在
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

/**
 * 验收补做：spec §4「记忆」行——web 臂客户端取 getSpiritMemory/getQuestionnaire
 * 并随请求体带上，解读成功后 spiritMemoryAction → saveSpiritMemory 写回。
 * 顺带补上最终评审报告点名的缺口：web 提交路径此前零覆盖，本组一并补齐
 * （命中 /api/spirit/dream、请求体含 chart+dream+memory）。
 */
describe("验收补做：web 臂记忆读取/写回 + 提交路径", () => {
  it("挂载时取 memory/questionnaire；提交时随请求体带上；成功后提炼摘要写回", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("这个梦在替你处理最近的紧绷。", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    spiritMemoryActionMock.mockResolvedValueOnce("摘要：常梦见坠落，反映对失控的焦虑。");

    await renderDreamPage();
    const textarea = await screen.findByRole("textbox");
    // 挂载时已取记忆——不是提交时才现取
    expect(getSpiritMemoryMock).toHaveBeenCalledWith("p1");
    expect(getQuestionnaireMock).toHaveBeenCalledWith("p1");

    fireEvent.change(textarea, { target: { value: "我梦见自己在坠落，怎么都落不到底。" } });
    fireEvent.click(screen.getByText("解这个梦"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/spirit/dream");
    // EP-account2 阻断 3：路由硬要求 Bearer——页面发出的请求必须带 Authorization
    // （与本分支已有的 x-zj-locale 头共存）。这正是「路由改了客户端没改」的洞，
    // 守的是请求形态而不是服务端行为（服务端行为由 route.test.ts 独立覆盖）。
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-access-token");
    expect(headers["x-zj-locale"]).toBe("zh");
    const body = JSON.parse(init!.body as string);
    expect(body.dream).toBe("我梦见自己在坠落，怎么都落不到底。");
    expect(body.chart).toBeTruthy();
    expect(body.memory).toBe("他最近反复提到换工作的纠结。"); // 挂载时取到的旧记忆随请求体带上

    await waitFor(() => expect(screen.getByText("这个梦在替你处理最近的紧绷。")).toBeInTheDocument());
    await waitFor(() => expect(spiritMemoryActionMock).toHaveBeenCalled());
    expect(spiritMemoryActionMock).toHaveBeenCalledWith(
      [
        { role: "user", content: "我梦见自己在坠落，怎么都落不到底。" },
        { role: "spirit", content: "这个梦在替你处理最近的紧绷。" },
      ],
      "他最近反复提到换工作的纠结。",
    );
    await waitFor(() => expect(saveSpiritMemoryMock).toHaveBeenCalledWith("p1", "摘要：常梦见坠落，反映对失控的焦虑。"));
  });

  it("提炼返回空（无新信息）→ 不写回 saveSpiritMemory", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("解读文本。", { status: 200 })));
    spiritMemoryActionMock.mockResolvedValueOnce(null);

    await renderDreamPage();
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "梦见考试没带准考证。" } });
    fireEvent.click(screen.getByText("解这个梦"));

    await waitFor(() => expect(screen.getByText("解读文本。")).toBeInTheDocument());
    await waitFor(() => expect(spiritMemoryActionMock).toHaveBeenCalled());
    expect(saveSpiritMemoryMock).not.toHaveBeenCalled();
  });
});

describe("EP-account2 阻断 3：web 臂 401 友好态（不扔服务端裸字符串）", () => {
  it("无会话（拿不到 token）+ 服务端 401 → 渲染引导登录文案与链接，不出现裸「未登录」", async () => {
    supabaseSession.current = null;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("未登录", { status: 401 })));

    await renderDreamPage();
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "梦见自己站在很高的桥上。" } });
    fireEvent.click(screen.getByText("解这个梦"));

    // 友好引导态出现，且是指向 /account 的链接
    expect(await screen.findByText("解梦需要先确认身份——去账号页登录，或先绑定邮箱。")).toBeInTheDocument();
    const cta = screen.getByText("去登录 →");
    expect(cta.closest("a")).toHaveAttribute("href", "/account");
    // 服务端裸字符串不得直接上屏
    expect(screen.queryByText("未登录")).toBeNull();
    // 失败不进入记忆写回链路
    expect(spiritMemoryActionMock).not.toHaveBeenCalled();
  });

  it("有会话但服务端仍 401（token 失效）→ 同样落引导态", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("未登录", { status: 401 })));

    await renderDreamPage();
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "梦见考试迟到。" } });
    fireEvent.click(screen.getByText("解这个梦"));

    expect(await screen.findByText("解梦需要先确认身份——去账号页登录，或先绑定邮箱。")).toBeInTheDocument();
  });
});

describe("验收跟进 3：flag 关 + TG 环境时 MainButton 不可见", () => {
  it("useTgMainButton 收到 visible=false → MainButton.hide 被调，show/setText 不被调", async () => {
    vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "");
    tgEnv.inTg = true;
    // isTelegram 为 true 后 useTgMainButton 会真的去读 window.Telegram.WebApp.MainButton，
    // jsdom 里没有，连 SDK 面一起桩掉（fengshui/__tests__/page.test.tsx 同一模式）。
    const mb = {
      setText: vi.fn(), enable: vi.fn(), disable: vi.fn(),
      show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn(),
    };
    window.Telegram = {
      WebApp: {
        initData: "x",
        MainButton: mb,
        HapticFeedback: { impactOccurred: vi.fn(), notificationOccurred: vi.fn() },
      },
    };
    await renderDreamPage();
    // 页面本体仍是 notEnabled 早退（对照：按钮不可见不是靠「页面没渲染」碰巧成立）
    expect(screen.getByText("「解梦」尚未开启。")).toBeInTheDocument();
    expect(mb.hide).toHaveBeenCalled();
    expect(mb.show).not.toHaveBeenCalled();
    expect(mb.setText).not.toHaveBeenCalled();
  });
});

describe("EP-dream-history：历史列表 + 追问", () => {
  it("挂载时取最近历史（web 臂）并渲染摘要；只存摘要不含梦原文的形态由 route 测试守，这里只守渲染", async () => {
    listDreamHistoryMock.mockResolvedValueOnce([
      { id: "h1", summary: "一个关于坠落的梦", createdAt: "2026-08-19T00:00:00Z" },
      { id: "h2", summary: "一个关于被追赶的梦", createdAt: "2026-08-18T00:00:00Z" },
    ]);
    await renderDreamPage();
    await screen.findByRole("textbox");
    expect(listDreamHistoryMock).toHaveBeenCalledWith("p1");
    expect(await screen.findByText("一个关于坠落的梦")).toBeInTheDocument();
    expect(screen.getByText("一个关于被追赶的梦")).toBeInTheDocument();
    expect(screen.getByText("最近的梦")).toBeInTheDocument();
  });

  it("历史加载失败不影响表单渲染（独立 try/catch，不污染 profile 早退路径）", async () => {
    listDreamHistoryMock.mockRejectedValueOnce(new Error("db down"));
    await renderDreamPage();
    expect(await screen.findByRole("textbox")).toBeInTheDocument();
    expect(screen.queryByText("最近的梦")).toBeNull();
  });

  it("首次解读成功后：显示追问输入框，只提炼一次历史摘要写回 appendDreamHistory 并刷新列表", async () => {
    const fetchMock = vi.fn(async () => new Response("这个梦在处理坠落感。", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    dreamSummaryActionMock.mockResolvedValueOnce("一个关于坠落的梦");
    listDreamHistoryMock.mockResolvedValue([]); // 初始为空；追加后刷新时仍返回空（只验证调用形态）

    await renderDreamPage();
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "我梦见自己在坠落，怎么都落不到底。" } });
    fireEvent.click(screen.getByText("解这个梦"));

    await waitFor(() => expect(screen.getByText("这个梦在处理坠落感。")).toBeInTheDocument());
    // 首轮对话渲染：用户与灵各一条，标签分别是「你说」与「解 梦」kicker
    expect(screen.getByText("我梦见自己在坠落，怎么都落不到底。")).toBeInTheDocument();
    expect(screen.getByText("你说")).toBeInTheDocument();

    await waitFor(() => expect(dreamSummaryActionMock).toHaveBeenCalledWith(
      "我梦见自己在坠落，怎么都落不到底。",
      "这个梦在处理坠落感。",
      "zh",
    ));
    await waitFor(() => expect(appendDreamHistoryMock).toHaveBeenCalledWith("p1", "一个关于坠落的梦"));
    await waitFor(() => expect(listDreamHistoryMock).toHaveBeenCalledTimes(2)); // 挂载一次 + 追加后刷新一次

    // 追问输入框取代了原来的「梦」输入框（placeholder 变化），且历史列表在有对话时收起
    expect(screen.getByPlaceholderText("还想问点什么？")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("比如：我梦见自己在一片很清的水面上走……")).toBeNull();
  });

  it("追问：请求体带 dream(原文)+followUp+priorTurns，成功后追加渲染新一轮对话，且不重复写历史摘要", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("这个梦在处理坠落感。", { status: 200 }))
      .mockResolvedValueOnce(new Response("坠落常和失控感有关。", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    dreamSummaryActionMock.mockResolvedValueOnce("一个关于坠落的梦");

    await renderDreamPage();
    const textarea = await screen.findByRole("textbox");
    fireEvent.change(textarea, { target: { value: "我梦见自己在坠落，怎么都落不到底。" } });
    fireEvent.click(screen.getByText("解这个梦"));
    await waitFor(() => expect(screen.getByText("这个梦在处理坠落感。")).toBeInTheDocument());
    dreamSummaryActionMock.mockClear();
    appendDreamHistoryMock.mockClear();

    const followUpBox = screen.getByPlaceholderText("还想问点什么？");
    fireEvent.change(followUpBox, { target: { value: "会不会跟换工作有关？" } });
    fireEvent.click(screen.getByText("追问"));

    await waitFor(() => expect(screen.getByText("坠落常和失控感有关。")).toBeInTheDocument());
    const [, init] = fetchMock.mock.calls[1]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.dream).toBe("我梦见自己在坠落，怎么都落不到底。"); // 首轮梦原文，用于服务端重建首轮 prompt
    expect(body.followUp).toBe("会不会跟换工作有关？");
    expect(body.priorTurns).toEqual([{ role: "spirit", content: "这个梦在处理坠落感。" }]);
    expect(screen.getByText("会不会跟换工作有关？")).toBeInTheDocument();

    // 追问不产生新的历史条目——只有首次解读那一次会写
    await new Promise((r) => setTimeout(r, 0));
    expect(dreamSummaryActionMock).not.toHaveBeenCalled();
    expect(appendDreamHistoryMock).not.toHaveBeenCalled();
  });
});
