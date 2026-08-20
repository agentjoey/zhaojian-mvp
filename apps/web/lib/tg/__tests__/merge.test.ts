// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const rpcMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: { getUser: (...a: unknown[]) => getUserMock(...a) },
    rpc: (...a: unknown[]) => rpcMock(...a),
  }),
}));

const { mergeAnonProfiles } = await import("../merge");

beforeEach(() => vi.clearAllMocks());

describe("mergeAnonProfiles：改调单事务 RPC（EP-account2-06）", () => {
  it("匿名用户存在且不是目标账号 → 调 RPC merge_anon_profiles，返回其迁移行数", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "anon1", is_anonymous: true } } });
    rpcMock.mockResolvedValue({ data: 3, error: null });
    const r = await mergeAnonProfiles("anon-token", "target1");
    expect(rpcMock).toHaveBeenCalledWith("merge_anon_profiles", { p_anon_id: "anon1", p_target_id: "target1" });
    expect(r).toEqual({ merged: 3 });
  });

  it("token 解析不出用户 → merged: 0，不调 RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const r = await mergeAnonProfiles("bad-token", "target1");
    expect(r).toEqual({ merged: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("解析出的用户不是匿名用户 → merged: 0，不调 RPC（防止误把已登录用户的档案转走）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1", is_anonymous: false } } });
    const r = await mergeAnonProfiles("token", "target1");
    expect(r).toEqual({ merged: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("匿名用户 id 与目标账号相同 → merged: 0，不调 RPC", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "same", is_anonymous: true } } });
    const r = await mergeAnonProfiles("token", "same");
    expect(r).toEqual({ merged: 0 });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("RPC 返回 error → merged: 0（不抛错，调用方是「尽力而为」的合并，失败不阻断登录流程）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "anon1", is_anonymous: true } } });
    rpcMock.mockResolvedValue({ data: null, error: { message: "db error" } });
    const r = await mergeAnonProfiles("token", "target1");
    expect(r).toEqual({ merged: 0 });
  });

  it("RPC 返回 data: null 且 error: null → merged: 0（覆盖 ?? 0 分支）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "anon1", is_anonymous: true } } });
    rpcMock.mockResolvedValue({ data: null, error: null });
    const r = await mergeAnonProfiles("token", "target1");
    expect(r).toEqual({ merged: 0 });
  });
});
