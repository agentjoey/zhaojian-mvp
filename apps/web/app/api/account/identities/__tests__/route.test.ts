// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveUidMock = vi.fn();
const resolveAccessMock = vi.fn();
const recordConsentOnceMock = vi.fn();
const getUserByIdMock = vi.fn();
const tgMaybeSingleMock = vi.fn();

vi.mock("@/lib/account/uid", () => ({ resolveUid: (...a: unknown[]) => resolveUidMock(...a) }));
vi.mock("@/lib/access", () => ({
  resolveAccess: (...a: unknown[]) => resolveAccessMock(...a),
  SYNTHETIC_EMAIL_DOMAIN: "zhaojian.local",
}));
vi.mock("@/lib/consent", () => ({
  recordConsentOnce: (...a: unknown[]) => recordConsentOnceMock(...a),
  TERMS_VERSION: "2026-08-20",
}));
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: { admin: { getUserById: (...a: unknown[]) => getUserByIdMock(...a) } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => tgMaybeSingleMock() }) }) }),
  }),
}));

const { GET } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  resolveUidMock.mockResolvedValue({ uid: "u1", via: "tg", needsRefresh: false });
  resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
  getUserByIdMock.mockResolvedValue({ data: { user: { email: null } } });
  tgMaybeSingleMock.mockResolvedValue({ data: { username: "bob" } });
});

describe("GET /api/account/identities", () => {
  it("未登录 → 401，不查身份也不记录同意", async () => {
    resolveUidMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(401);
    expect(recordConsentOnceMock).not.toHaveBeenCalled();
  });

  it("已识别（非 anonymous）→ 记一次 consent（best-effort，不阻塞响应）", async () => {
    const res = await GET(new Request("http://x"));
    expect(res.status).toBe(200);
    expect(recordConsentOnceMock).toHaveBeenCalledWith("u1", "terms", "2026-08-20");
  });

  it("resolveAccess 判定 anonymous（理论上不该走到这——resolveUid 已经拿到 uid，但防御性覆盖）→ 不记录 consent", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
    await GET(new Request("http://x"));
    expect(recordConsentOnceMock).not.toHaveBeenCalled();
  });

  it("合成域名邮箱不返回给客户端（既有行为，回归锁定）", async () => {
    getUserByIdMock.mockResolvedValue({ data: { user: { email: "tg_1@zhaojian.local" } } });
    const res = await GET(new Request("http://x"));
    const json = await res.json();
    expect(json.email).toBeNull();
  });
});
