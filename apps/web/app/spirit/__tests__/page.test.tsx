import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BirthInputSchema, computeUnifiedChart } from "@eamvp/core";

/**
 * 最终评审 Blocking 2：/spirit 此前只认 `topic === "portrait"`，`?topic=fengshui:<id>`
 * 落地后 autoSend 恒为 undefined——remedyId 被解析出来即丢弃，用户落进空白通用聊天
 * （EP-fs-08 的验收「复用现有 topic 机制」只复用了 URL 形状，没复用机制本身）。
 * 这里改为 `?topic=fengshui&q=<动作文本>`：/spirit 据此拼出一句关于这条化解的提问，
 * 复用既有的 autoSend 机制（与 topic=portrait 同一套接线）。
 *
 * 全文件用 `SpiritPanel` 的桩组件截获 autoSend prop——真实 SpiritPanel 依赖 Supabase /
 * fetch / Telegram 等一整套外部世界，这里只关心「page.tsx 算出的 autoSend 是什么」，
 * 与 SpiritPanel 内部如何消费它是两件事（后者已有 SpiritPanel 自己的测试覆盖）。
 */
const spiritPanelPropsSpy = vi.fn();
vi.mock("@/app/chart/SpiritPanel", () => ({
  SpiritPanel: (props: { autoSend?: string }) => {
    spiritPanelPropsSpy(props);
    return <div data-testid="spirit-panel-stub">{props.autoSend ?? "(no autoSend)"}</div>;
  },
}));

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });
const profile = { id: "p1", nickname: "阿甲", birthInput: birth, chart: computeUnifiedChart(birth), createdAt: "", reading: null };

vi.mock("@/lib/profiles", () => ({ getActiveProfile: vi.fn(async () => profile) }));
vi.mock("@/lib/tg/client", () => ({ hasTgSession: () => false, tgGetProfile: vi.fn() }));

/**
 * 与 AppShell.test.tsx / fengshui/__tests__/page.test.tsx 同样的坑：page.tsx 顶层
 * `const ENABLED = process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1"` 在模块加载时求值，
 * 必须与 I18nProvider 出自同一次刚 resetModules 后的动态 import，否则 useT() 拿到的
 * I18nContext 实例对不上 Wrapper 提供的那个。
 */
async function renderSpiritPage(url: string) {
  window.history.pushState({}, "", url);
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <I18nProvider locale="zh">{children}</I18nProvider>;
  }
  return render(<Page />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "1");
  spiritPanelPropsSpy.mockReset();
});

describe("最终评审 Blocking 2：/spirit 消费 ?topic=fengshui&q=<动作文本>", () => {
  it("topic=fengshui&q=<动作文本> 时，autoSend 收到了根据该动作文本拼出的提问，而不是 undefined", async () => {
    await renderSpiritPage("/spirit?topic=fengshui&q=" + encodeURIComponent("床头靠东南一侧的实墙"));
    await waitFor(() => expect(spiritPanelPropsSpy).toHaveBeenCalled());
    const lastCall = spiritPanelPropsSpy.mock.calls.at(-1)![0] as { autoSend?: string };
    expect(lastCall.autoSend).toBeDefined();
    // autoSend 必须真的带着这条化解的动作文本本身，不能只是一句不知所云的通用寒暄
    expect(lastCall.autoSend).toContain("床头靠东南一侧的实墙");
  });

  it("topic=fengshui 但没有 q（畸形链接）时，autoSend 仍是 undefined，不拼出一句空话", async () => {
    await renderSpiritPage("/spirit?topic=fengshui");
    await waitFor(() => expect(spiritPanelPropsSpy).toHaveBeenCalled());
    const lastCall = spiritPanelPropsSpy.mock.calls.at(-1)![0] as { autoSend?: string };
    expect(lastCall.autoSend).toBeUndefined();
  });

  it("回归：topic=portrait 时 autoSend 仍是既有的画像开场白（不受本次改动影响）", async () => {
    await renderSpiritPage("/spirit?topic=portrait");
    await waitFor(() => expect(spiritPanelPropsSpy).toHaveBeenCalled());
    const lastCall = spiritPanelPropsSpy.mock.calls.at(-1)![0] as { autoSend?: string };
    expect(lastCall.autoSend).toBe("我想聊聊我的自我画像");
  });

  it("回归：不带 topic 时 autoSend 为 undefined", async () => {
    await renderSpiritPage("/spirit");
    await waitFor(() => expect(spiritPanelPropsSpy).toHaveBeenCalled());
    const lastCall = spiritPanelPropsSpy.mock.calls.at(-1)![0] as { autoSend?: string };
    expect(lastCall.autoSend).toBeUndefined();
  });
});

describe("回归：/spirit flag 关闭时显示未开启文案，不渲染 SpiritPanel", () => {
  it("NEXT_PUBLIC_SPIRIT_ENABLED 非 1 时不挂载 SpiritPanel", async () => {
    vi.stubEnv("NEXT_PUBLIC_SPIRIT_ENABLED", "");
    await renderSpiritPage("/spirit?topic=fengshui&q=x");
    expect(screen.getByText("本命之灵尚未开启。")).toBeInTheDocument();
    expect(screen.queryByTestId("spirit-panel-stub")).toBeNull();
  });
});
