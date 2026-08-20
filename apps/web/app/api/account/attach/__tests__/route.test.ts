// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveUidMock = vi.fn();
const attachIdentityMock = vi.fn();
const completeEmailAttachMock = vi.fn();
vi.mock("@/lib/account/uid", () => ({ resolveUid: (...a: unknown[]) => resolveUidMock(...a) }));
vi.mock("@/lib/tg/identity-link", () => ({
  attachIdentity: (...a: unknown[]) => attachIdentityMock(...a),
  completeEmailAttach: (...a: unknown[]) => completeEmailAttachMock(...a),
}));
type VerifyResult = { ok: true; id: number; username?: string } | { ok: false; error: string };
const verifyTelegramLoginMock = vi.fn<(p: unknown, token: string) => VerifyResult>(() => ({ ok: true, id: 999, username: "bob" }));
vi.mock("@eamvp/core", () => ({ verifyTelegramLogin: (p: unknown, token: string) => verifyTelegramLoginMock(p, token) }));

const { POST } = await import("../route");

function req(body: unknown): Request {
  return new Request("http://x/api/account/attach", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveUidMock.mockResolvedValue({ uid: "u1", via: "web", needsRefresh: false });
  attachIdentityMock.mockResolvedValue({ ok: true });
  completeEmailAttachMock.mockResolvedValue({ ok: true });
  // clearAllMocks 只清调用记录、不清 mockReturnValue 的实现——必须在每个用例前
  // 重设默认实现，否则「verifyTelegramLogin 失败」用例的 mockReturnValue 会泄漏给后续用例。
  verifyTelegramLoginMock.mockReturnValue({ ok: true, id: 999, username: "bob" });
});

describe("POST /api/account/attach", () => {
  it("未登录 → 401，不调用 attachIdentity", async () => {
    resolveUidMock.mockResolvedValue(null);
    const res = await POST(req({ kind: "email", email: "a@x.com" }));
    expect(res.status).toBe(401);
    expect(attachIdentityMock).not.toHaveBeenCalled();
  });

  it("kind=email：合法邮箱 → 200，attachIdentity 收到 {kind:'email', email}", async () => {
    const res = await POST(req({ kind: "email", email: "a@x.com" }));
    expect(res.status).toBe(200);
    expect(attachIdentityMock).toHaveBeenCalledWith("u1", { kind: "email", email: "a@x.com" });
  });

  it("kind=email：非法邮箱格式 → 400，不调用 attachIdentity", async () => {
    const res = await POST(req({ kind: "email", email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(attachIdentityMock).not.toHaveBeenCalled();
  });

  it("kind=email：attachIdentity 返回 taken → 409", async () => {
    attachIdentityMock.mockResolvedValue({ ok: false, error: "taken" });
    const res = await POST(req({ kind: "email", email: "a@x.com" }));
    expect(res.status).toBe(409);
  });

  it("kind=email：attachIdentity 返回 already_attached（本账号已有别的已验证邮箱）→ 409", async () => {
    attachIdentityMock.mockResolvedValue({ ok: false, error: "already_attached" });
    const res = await POST(req({ kind: "email", email: "a@x.com" }));
    expect(res.status).toBe(409);
  });

  it("kind=email phase=complete：无 Authorization 头 → 400，不调用 completeEmailAttach", async () => {
    const res = await POST(req({ kind: "email", phase: "complete" }));
    expect(res.status).toBe(400);
    expect(completeEmailAttachMock).not.toHaveBeenCalled();
  });

  it("kind=email phase=complete：未登录（无 cookie）也受理——跨浏览器点击场景，tgUid 传 null", async () => {
    resolveUidMock.mockResolvedValue(null);
    const res = await POST(
      new Request("http://x/api/account/attach", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer tok123" },
        body: JSON.stringify({ kind: "email", phase: "complete" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(completeEmailAttachMock).toHaveBeenCalledWith({ tgUid: null, bearerToken: "tok123" });
    expect(attachIdentityMock).not.toHaveBeenCalled();
  });

  it("kind=email phase=complete：TG 会话 → completeEmailAttach 收到 tgUid；no_pending → 400", async () => {
    resolveUidMock.mockResolvedValue({ uid: "u1", via: "tg", needsRefresh: false });
    completeEmailAttachMock.mockResolvedValue({ ok: false, error: "no_pending" });
    const res = await POST(
      new Request("http://x/api/account/attach", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer tok123" },
        body: JSON.stringify({ kind: "email", phase: "complete" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(completeEmailAttachMock).toHaveBeenCalledWith({ tgUid: "u1", bearerToken: "tok123" });
  });

  it("kind=email phase=complete：completeEmailAttach 返回 taken → 409", async () => {
    completeEmailAttachMock.mockResolvedValue({ ok: false, error: "taken" });
    const res = await POST(
      new Request("http://x/api/account/attach", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer tok123" },
        body: JSON.stringify({ kind: "email", phase: "complete" }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("kind=telegram：verifyTelegramLogin 通过 → attachIdentity 收到解析出的 tgId/username", async () => {
    const res = await POST(req({ kind: "telegram", id: 999, username: "bob", auth_date: 1, hash: "h" }));
    expect(res.status).toBe(200);
    expect(attachIdentityMock).toHaveBeenCalledWith("u1", { kind: "telegram", tgId: 999, username: "bob" });
  });

  it("kind=telegram：verifyTelegramLogin 失败 → 401，不调用 attachIdentity", async () => {
    verifyTelegramLoginMock.mockReturnValue({ ok: false, error: "bad hash" });
    const res = await POST(req({ kind: "telegram", id: 999, auth_date: 1, hash: "bad" }));
    expect(res.status).toBe(401);
    expect(attachIdentityMock).not.toHaveBeenCalled();
  });

  it("kind=telegram：attachIdentity 返回 already_attached → 409", async () => {
    attachIdentityMock.mockResolvedValue({ ok: false, error: "already_attached" });
    const res = await POST(req({ kind: "telegram", id: 999, auth_date: 1, hash: "h" }));
    expect(res.status).toBe(409);
  });

  it("kind 缺失或未知 → 400", async () => {
    const res = await POST(req({ kind: "bogus" }));
    expect(res.status).toBe(400);
    expect(attachIdentityMock).not.toHaveBeenCalled();
  });

  it("任何 kind 下 via 不再是「必须对应」的前提——TG 会话也能绑邮箱、web 会话也能绑 TG（对称化的核心断言）", async () => {
    resolveUidMock.mockResolvedValue({ uid: "u1", via: "tg", needsRefresh: false });
    const res1 = await POST(req({ kind: "email", email: "a@x.com" }));
    expect(res1.status).toBe(200);

    resolveUidMock.mockResolvedValue({ uid: "u1", via: "web", needsRefresh: false });
    const res2 = await POST(req({ kind: "telegram", id: 999, auth_date: 1, hash: "h" }));
    expect(res2.status).toBe(200);
  });
});
