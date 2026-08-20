// @vitest-environment node
//
// 测法同 app/api/tg/fengshui/__tests__/route.test.ts：直接 import 路由处理函数、
// 拿 Node 原生 Request 调用。
//
// EP-account-login：换设备用已注册邮箱登录（account 页退回 signInWithEmail 后），
// /auth/callback 拿新会话调这个端点合并匿名设备数据。核心约束：目标账号只能从
// Authorization Bearer 解析，不能信任请求体传来的 uid（否则任何人拿着别人的匿名
// token 就能把数据合并进自己账号，或者反过来）。
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn(async (_token?: string) => ({ data: { user: { id: "real-u1" } } }));
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (t: string) => getUserMock(t) } }),
}));
const mergeAnonProfilesSpy = vi.fn(async (..._a: unknown[]) => ({ merged: 3 }));
vi.mock("@/lib/tg/merge", () => ({
  mergeAnonProfiles: (...a: unknown[]) => mergeAnonProfilesSpy(...(a as [string, string])),
}));

const { POST } = await import("../route");

function req(body: unknown, token?: string) {
  return new Request("http://x/api/account/merge-anon", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/account/merge-anon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "real-u1" } } });
    mergeAnonProfilesSpy.mockResolvedValue({ merged: 3 });
  });

  it("无 Authorization → 401，不调用 mergeAnonProfiles", async () => {
    const res = await POST(req({ anonAccessToken: "anon-tok" }));
    expect(res.status).toBe(401);
    expect(mergeAnonProfilesSpy).not.toHaveBeenCalled();
  });

  it("Bearer 解不出用户 → 401，不调用 mergeAnonProfiles", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const res = await POST(req({ anonAccessToken: "anon-tok" }, "bad-tok"));
    expect(res.status).toBe(401);
    expect(mergeAnonProfilesSpy).not.toHaveBeenCalled();
  });

  it("正常：目标 uid 取自 Bearer（不是请求体），透传 anonAccessToken，返回合并数", async () => {
    // 请求体故意带一个不同的 uid 字段，路由不应该读它——目标账号必须只认 Bearer。
    const res = await POST(req({ anonAccessToken: "anon-tok", targetUserId: "attacker-controlled" }, "real-tok"));
    expect(res.status).toBe(200);
    expect(getUserMock).toHaveBeenCalledWith("real-tok");
    expect(mergeAnonProfilesSpy).toHaveBeenCalledWith("anon-tok", "real-u1");
    expect(await res.json()).toEqual({ merged: 3 });
  });

  it("缺 anonAccessToken → 直接返回 merged:0，不调用 mergeAnonProfiles（无匿名会话可合并）", async () => {
    const res = await POST(req({}, "real-tok"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ merged: 0 });
    expect(mergeAnonProfilesSpy).not.toHaveBeenCalled();
  });
});
