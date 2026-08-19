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
vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => false,
  isTelegram: () => tgEnv.inTg,
  tgGetProfile: vi.fn(),
}));
const spiritMemoryActionMock = vi.fn(async (..._a: unknown[]): Promise<string | null> => null);
vi.mock("@/app/actions", () => ({
  spiritMemoryAction: (...a: unknown[]) => spiritMemoryActionMock(...a),
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
  vi.stubEnv("NEXT_PUBLIC_DREAM_ENABLED", "1");
  getSpiritMemoryMock.mockClear();
  saveSpiritMemoryMock.mockClear();
  getQuestionnaireMock.mockClear();
  spiritMemoryActionMock.mockClear();
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
