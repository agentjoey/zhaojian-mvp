import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

const getWebUserMock = vi.fn(async (): Promise<{ id: string; email: string | null; isAnonymous: boolean } | null> => null);
const signInWithEmailMock = vi.fn(async (..._a: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }));
const upgradeAnonymousToEmailMock = vi.fn(async (..._a: unknown[]): Promise<{ ok: true } | { ok: false; error: string }> => ({ ok: true }));
const getSessionMock = vi.fn(async () => ({ data: { session: null as { access_token: string } | null } }));
vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ANON_MERGE_TOKEN_KEY: actual.ANON_MERGE_TOKEN_KEY,
    getWebUser: (...a: unknown[]) => getWebUserMock(...a),
    signInWithEmail: (...a: unknown[]) => signInWithEmailMock(...a),
    signOutWeb: vi.fn(),
    upgradeAnonymousToEmail: (...a: unknown[]) => upgradeAnonymousToEmailMock(...a),
    supabase: () => ({ auth: { getSession: getSessionMock } }),
  };
});
const hasTgSessionMock = vi.fn(() => true);
vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => hasTgSessionMock(),
  tgLoginWithWidget: vi.fn(),
  tgLogout: vi.fn(),
}));
vi.mock("@/lib/tg/ui", () => ({ useIsTelegram: () => false }));
vi.mock("@/components/Paywall", () => ({ Paywall: () => null }));

const { ANON_MERGE_TOKEN_KEY } = await import("@/lib/supabase");

const fetchMock = vi.fn(async (url: string) => {
  if (url === "/api/tg/session") return new Response(JSON.stringify({ active: true, refreshed: false }), { status: 200 });
  if (url.startsWith("/api/account/identities")) return new Response(JSON.stringify({ email: null, telegram: { username: "u1" } }), { status: 200 });
  if (url.startsWith("/api/billing/status")) return new Response(JSON.stringify({ tier: "free", memberUntil: null, used: 0, free: 30 }), { status: 200 });
  return new Response("{}", { status: 200 });
});

async function renderAccountPage() {
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Page />, { wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider> });
  });
  return result;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  hasTgSessionMock.mockReturnValue(true);
  getWebUserMock.mockReset().mockResolvedValue(null);
  signInWithEmailMock.mockReset().mockResolvedValue({ ok: true });
  upgradeAnonymousToEmailMock.mockReset().mockResolvedValue({ ok: true });
  getSessionMock.mockReset().mockResolvedValue({ data: { session: null } });
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockClear();
});

describe("EP-account2-03：/account 真正消费 /api/tg/session 的确认结果", () => {
  it("active=true → 保持已登录态（TG 视图渲染出来，不回退到匿名态）", async () => {
    await renderAccountPage();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/tg/session", expect.anything()));
    // TG 视图特征：账户危险区/登出按钮出现（既有 view.kind==="telegram" 分支才会渲染）
    expect(await screen.findByText("登出")).toBeInTheDocument();
  });

  it("active=false → 落到未登录态（不是继续假装已登录），且不再渲染登出按钮", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/api/tg/session") return new Response(JSON.stringify({ active: false, refreshed: false }), { status: 200 });
      return new Response("{}", { status: 200 });
    });
    await renderAccountPage();
    await waitFor(() => expect(screen.queryByText("登出")).toBeNull());
  });
});

describe("EP-account-login：换设备用已注册邮箱登录", () => {
  beforeEach(() => {
    hasTgSessionMock.mockReturnValue(false);
  });

  async function fillAndSubmit(email = "existing@example.com") {
    const input = await screen.findByLabelText("邮箱地址");
    fireEvent.change(input, { target: { value: email } });
    await act(async () => {
      fireEvent.click(screen.getByText("发送登录链接"));
    });
  }

  it("匿名设备 + upgrade 成功（全新邮箱）→ 不退回 signInWithEmail，不落匿名 token", async () => {
    getWebUserMock.mockResolvedValue({ id: "anon1", email: null, isAnonymous: true });
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "anon-tok-1" } } });
    upgradeAnonymousToEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(upgradeAnonymousToEmailMock).toHaveBeenCalledWith("existing@example.com"));
    expect(signInWithEmailMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBeNull();
    expect(await screen.findByText("已发送，请查收邮件中的登录链接")).toBeInTheDocument();
  });

  it("匿名设备 + upgrade 失败（邮箱已属于别的账号）→ 退回 signInWithEmail 真正登录，先存好匿名 token", async () => {
    getWebUserMock.mockResolvedValue({ id: "anon1", email: null, isAnonymous: true });
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "anon-tok-1" } } });
    upgradeAnonymousToEmailMock.mockResolvedValue({ ok: false, error: "A user with this email address has already been registered" });
    signInWithEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(signInWithEmailMock).toHaveBeenCalledWith("existing@example.com"));
    // 退回登录前已经存好匿名 token（不依赖 upgrade 报错文案，任何失败都退回）
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBe("anon-tok-1");
    expect(await screen.findByText("已发送，请查收邮件中的登录链接")).toBeInTheDocument();
  });

  it("匿名设备 + upgrade 失败 + 退回登录也失败 → 报错，清掉暂存的匿名 token（没有后续 callback 会用到它）", async () => {
    getWebUserMock.mockResolvedValue({ id: "anon1", email: null, isAnonymous: true });
    getSessionMock.mockResolvedValue({ data: { session: { access_token: "anon-tok-1" } } });
    upgradeAnonymousToEmailMock.mockResolvedValue({ ok: false, error: "taken" });
    signInWithEmailMock.mockResolvedValue({ ok: false, error: "发送失败" });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(screen.getByText("发送失败")).toBeInTheDocument());
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBeNull();
  });

  it("非匿名（无会话）→ 直接 signInWithEmail，不碰 upgradeAnonymousToEmail 或匿名 token", async () => {
    getWebUserMock.mockResolvedValue(null);
    signInWithEmailMock.mockResolvedValue({ ok: true });

    await renderAccountPage();
    await fillAndSubmit();

    await waitFor(() => expect(signInWithEmailMock).toHaveBeenCalledWith("existing@example.com"));
    expect(upgradeAnonymousToEmailMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBeNull();
  });
});
