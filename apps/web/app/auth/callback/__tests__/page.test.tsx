import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, act } from "@testing-library/react";
import { ANON_MERGE_TOKEN_KEY } from "@/lib/supabase";

// EP-account-login：换设备用已注册邮箱登录时，/account 的 handleSendLink 会在退回
// 真正登录前把匿名 access token 存进 localStorage（ANON_MERGE_TOKEN_KEY）；这里守
// /auth/callback 认出新会话后，读它、调 /api/account/merge-anon、清掉 key、不阻断
// 跳转。bind 流程（EP-account2 邮箱绑定）必须完全不碰这条新逻辑——两者互斥分支。

const replaceMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock }) }));

const sessionRef = { current: null as { access_token: string } | null };
const getSessionMock = vi.fn(async () => ({ data: { session: sessionRef.current } }));
vi.mock("@/lib/supabase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase")>("@/lib/supabase");
  return {
    ANON_MERGE_TOKEN_KEY: actual.ANON_MERGE_TOKEN_KEY,
    supabase: () => ({ auth: { getSession: getSessionMock } }),
  };
});

async function renderCallback(search = "") {
  Object.defineProperty(window, "location", {
    value: { ...window.location, search },
    writable: true,
  });
  const { default: Page } = await import("../page");
  const { I18nProvider } = await import("@/lib/i18n/I18nProvider");
  await act(async () => {
    render(<Page />, { wrapper: ({ children }) => <I18nProvider locale="zh">{children}</I18nProvider> });
  });
}

beforeEach(() => {
  replaceMock.mockClear();
  getSessionMock.mockClear();
  sessionRef.current = { access_token: "real-session-token" };
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("/auth/callback：bind 分支（EP-account2，回归——不被本次改动波及）", () => {
  it("URL 带 ?bind=<nonce> → 跳 /account?bind=<nonce>，不读/不清 ANON_MERGE_TOKEN_KEY，不调 merge-anon", async () => {
    localStorage.setItem(ANON_MERGE_TOKEN_KEY, "should-not-be-touched");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await renderCallback("?bind=abc123");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account?bind=abc123"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBe("should-not-be-touched");
  });
});

describe("/auth/callback：EP-account-login 匿名数据合并", () => {
  it("无 bind、无暂存 token → 直接跳 /account，不调 merge-anon", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await renderCallback("");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("有暂存 token → 调 merge-anon（Bearer 用新会话 token，body 用暂存的匿名 token），清掉 key，成功后仍跳 /account", async () => {
    localStorage.setItem(ANON_MERGE_TOKEN_KEY, "anon-tok-xyz");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ merged: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await renderCallback("");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/merge-anon",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer real-session-token" }),
      }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toEqual({ anonAccessToken: "anon-tok-xyz" });
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBeNull(); // 一次性 token，用完即清
  });

  it("merge 成功且 merged>0 → 写 sessionStorage zj_merged 供 /account 读取展示", async () => {
    localStorage.setItem(ANON_MERGE_TOKEN_KEY, "anon-tok");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ merged: 4 }), { status: 200 })));
    await renderCallback("");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account"));
    expect(sessionStorage.getItem("zj_merged")).toBe("4");
  });

  it("merged:0 → 不写 zj_merged（没什么好提示的）", async () => {
    localStorage.setItem(ANON_MERGE_TOKEN_KEY, "anon-tok");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ merged: 0 }), { status: 200 })));
    await renderCallback("");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account"));
    expect(sessionStorage.getItem("zj_merged")).toBeNull();
  });

  it("merge-anon 请求失败（网络异常/非 200）不阻断登录——仍然跳 /account，key 已清", async () => {
    localStorage.setItem(ANON_MERGE_TOKEN_KEY, "anon-tok");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    await renderCallback("");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account"));
    expect(localStorage.getItem(ANON_MERGE_TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem("zj_merged")).toBeNull();
  });
});

describe("/auth/callback：EP-auth-return ?next= 回跳", () => {
  it("URL 带 ?next=/dream（无 bind）→ 跳回 /dream 而不是 /account", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await renderCallback("?next=/dream");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dream"));
  });

  it("bind 分支优先于 next——两者都带时走 bind（bind 需要知情同意确认屏，不能被 next 绕过）", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await renderCallback("?bind=abc123&next=/dream");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account?bind=abc123"));
  });

  it("有暂存匿名 token 时，next 回跳与合并互不影响——先合并再跳 next", async () => {
    localStorage.setItem(ANON_MERGE_TOKEN_KEY, "anon-tok");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ merged: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await renderCallback("?next=/dream");
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/dream"));
    expect(fetchMock).toHaveBeenCalledWith("/api/account/merge-anon", expect.anything());
    expect(sessionStorage.getItem("zj_merged")).toBe("1");
  });

  it("?next=//evil.com（协议相对地址）→ 拒绝，落回默认 /account（防 open redirect）", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await renderCallback("?next=" + encodeURIComponent("//evil.com"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account"));
  });

  it("?next=https://evil.com（绝对地址）→ 拒绝，落回默认 /account", async () => {
    vi.stubGlobal("fetch", vi.fn());
    await renderCallback("?next=" + encodeURIComponent("https://evil.com"));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/account"));
  });
});
