// @vitest-environment node
//
// 刻意不 mock next/headers——resolveUid 改造后只依赖 req.headers，
// 用手搓 Request 直接验证（同 api/fengshui/reading route 测试的既有理由：
// 这个仓库的 route 测试统一走「直接 import handler + Request」，不经过
// Next 真实分发，next/headers 的 cookies() 在这种调用方式下不可靠）。
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret");

const getUserMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (...a: unknown[]) => getUserMock(...a) } }),
}));

const { resolveUid } = await import("../uid");
const { makeSessionToken } = await import("@/lib/tg/session");

function reqWithCookie(cookie: string): Request {
  return new Request("http://x/api/whatever", { headers: { cookie } });
}

beforeEach(() => vi.clearAllMocks());

describe("resolveUid：不依赖 next/headers，只读 Request 本身", () => {
  it("有效 zj_tg cookie → via=tg", async () => {
    const token = makeSessionToken("u1", 42);
    const r = await resolveUid(reqWithCookie(`zj_tg=${token}`));
    expect(r).toEqual({ uid: "u1", via: "tg" });
  });

  it("无 zj_tg cookie，有 Bearer → via=web", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u2" } } });
    const req = new Request("http://x/api/whatever", { headers: { authorization: "Bearer tok" } });
    const r = await resolveUid(req);
    expect(r).toEqual({ uid: "u2", via: "web" });
  });

  it("cookie 与 Bearer 都没有 → null", async () => {
    const r = await resolveUid(new Request("http://x/api/whatever"));
    expect(r).toBeNull();
  });

  it("cookie 存在但已过期/篡改，Bearer 兜底成立 → 走 web 分支", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u3" } } });
    const req = new Request("http://x/api/whatever", {
      headers: { cookie: "zj_tg=garbage", authorization: "Bearer tok" },
    });
    const r = await resolveUid(req);
    expect(r).toEqual({ uid: "u3", via: "web" });
  });
});
