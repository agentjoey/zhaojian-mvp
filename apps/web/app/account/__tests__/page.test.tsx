import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({
  getWebUser: vi.fn(async () => null),
  signInWithEmail: vi.fn(),
  signOutWeb: vi.fn(),
  upgradeAnonymousToEmail: vi.fn(),
  supabase: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));
const hasTgSessionMock = vi.fn(() => true);
vi.mock("@/lib/tg/client", () => ({
  hasTgSession: () => hasTgSessionMock(),
  tgLoginWithWidget: vi.fn(),
  tgLogout: vi.fn(),
}));
vi.mock("@/lib/tg/ui", () => ({ useIsTelegram: () => false }));
vi.mock("@/components/Paywall", () => ({ Paywall: () => null }));

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
