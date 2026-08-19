// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveUidMock = vi.fn();
vi.mock("@/lib/account/uid", () => ({ resolveUid: (...a: unknown[]) => resolveUidMock(...a) }));

const getEntitlementMock = vi.fn();
const usageMaybeSingleMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  getEntitlement: (...a: unknown[]) => getEntitlementMock(...a),
  isMember: (e: { tier: string; memberUntil: string | null }) =>
    e.tier === "member" && !!e.memberUntil && new Date(e.memberUntil).getTime() > Date.now(),
}));
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => usageMaybeSingleMock() }) }) }) }),
  }),
}));

const { GET } = await import("../route");

beforeEach(() => {
  vi.clearAllMocks();
  usageMaybeSingleMock.mockResolvedValue({ data: { uses: 3 } });
  getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
});

describe("GET /api/billing/status", () => {
  it("resolveUid 解析不出身份 → free/未用量，不查 entitlements（未登录也要有响应，不是 401）", async () => {
    resolveUidMock.mockResolvedValue(null);
    const res = await GET(new Request("http://x"));
    const json = await res.json();
    expect(json).toMatchObject({ tier: "free", memberUntil: null, used: 0 });
    expect(getEntitlementMock).not.toHaveBeenCalled();
  });

  it("resolveUid 解析出 uid（不论 via）→ 查 entitlements 与本月用量", async () => {
    resolveUidMock.mockResolvedValue({ uid: "u1", via: "tg", needsRefresh: false });
    const res = await GET(new Request("http://x"));
    const json = await res.json();
    expect(getEntitlementMock).toHaveBeenCalledWith("u1");
    expect(json.used).toBe(3);
  });

  it("会员且未过期 → tier=member", async () => {
    resolveUidMock.mockResolvedValue({ uid: "u1", via: "web", needsRefresh: false });
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01T00:00:00Z" });
    const res = await GET(new Request("http://x"));
    expect((await res.json()).tier).toBe("member");
  });
});
