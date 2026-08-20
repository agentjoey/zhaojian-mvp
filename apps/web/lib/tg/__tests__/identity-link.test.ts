// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const listUsersMock = vi.fn();
const getUserByIdMock = vi.fn();
const updateUserByIdMock = vi.fn();
const deleteUserMock = vi.fn();
const getUserMock = vi.fn();
const tgByTgIdMock = vi.fn(); // select(...).eq("tg_user_id", ...).maybeSingle()
const tgByUidMock = vi.fn(); // select(...).eq("supabase_user_id", ...).maybeSingle()
const tgInsertMock = vi.fn();

vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: {
      getUser: (...a: unknown[]) => getUserMock(...a),
      admin: {
        listUsers: (...a: unknown[]) => listUsersMock(...a),
        getUserById: (...a: unknown[]) => getUserByIdMock(...a),
        updateUserById: (...a: unknown[]) => updateUserByIdMock(...a),
        deleteUser: (...a: unknown[]) => deleteUserMock(...a),
      },
    },
    from: () => ({
      select: () => ({
        eq: (field: string) => ({
          maybeSingle: () => (field === "tg_user_id" ? tgByTgIdMock() : tgByUidMock()),
        }),
      }),
      insert: (...a: unknown[]) => tgInsertMock(...a),
    }),
  }),
}));

const { attachIdentity, completeEmailAttach } = await import("../identity-link");

/** 线上影子用户的典型形态：合成邮箱 + email_confirmed_at 已填充（建号时 email_confirm:true）。 */
const SHADOW = {
  id: "u1",
  email: "tg_999@zhaojian.local",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: {},
  created_at: "2026-01-01T00:00:00Z",
};

function orphanProof(overrides: Record<string, unknown> = {}) {
  return {
    id: "orphan",
    email: "a@x.com",
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    user_metadata: {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listUsersMock.mockResolvedValue({ data: { users: [] } });
  getUserByIdMock.mockResolvedValue({ data: { user: { ...SHADOW } } });
  updateUserByIdMock.mockResolvedValue({ error: null });
  deleteUserMock.mockResolvedValue({ error: null });
  getUserMock.mockResolvedValue({ data: { user: orphanProof() } });
  tgByTgIdMock.mockResolvedValue({ data: null });
  tgByUidMock.mockResolvedValue({ data: null });
  tgInsertMock.mockResolvedValue({ error: null });
});

describe("attachIdentity · email 分支（阶段 1：prepare，只校验+记意向）", () => {
  it("影子用户绑新邮箱 → ok；只写 pending 意向，绝不提前写 email 字段（阻断 1 核心断言）", async () => {
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: true });
    expect(updateUserByIdMock).toHaveBeenCalledWith("u1", {
      user_metadata: { pending_email: "a@x.com", pending_email_at: expect.any(String) },
    });
    // 实测结论：updateUserById 写 email 不会清 confirmed_at（email_confirm:false 也不清），
    // 提前写字段 = 未验证却被 resolveAccess 判成已验证。此处锁死「prepare 永不写 email」。
    for (const [, attrs] of updateUserByIdMock.mock.calls) {
      expect(attrs).not.toHaveProperty("email");
    }
  });

  it("本账号已有别的真实已验证邮箱 → already_attached（409 语义），零写入（S3）", async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { ...SHADOW, email: "old@x.com", email_confirmed_at: "2026-01-01T00:00:00Z" } },
    });
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: false, error: "already_attached" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("同邮箱重绑（幂等）→ 放行 ok，可重新触发发信", async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { ...SHADOW, email: "a@x.com", email_confirmed_at: "2026-01-01T00:00:00Z" } },
    });
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: true });
    expect(updateUserByIdMock).toHaveBeenCalled();
  });

  it("邮箱已被别的账号占用 → taken；占用检查必须翻页（线上用户早已超过单页 50 条）", async () => {
    listUsersMock.mockImplementation(({ page = 1 }: { page?: number }) =>
      Promise.resolve({
        data: {
          users:
            page === 1
              ? Array.from({ length: 200 }, (_, i) => ({ id: `p${i}`, email: `p${i}@x.com` }))
              : [{ id: "u2", email: "a@x.com" }],
        },
      }),
    );
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: false, error: "taken" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("占用者就是本账号自己（数据残留）→ 不算 taken，放行", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [{ id: "u1", email: "a@x.com" }] } });
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: true });
  });
});

describe("completeEmailAttach · email 分支（阶段 2：点击验证链接后）", () => {
  it("意向匹配 + 新鲜孤儿 → 删孤儿、邮箱写入目标并显式 email_confirm:true（所有权刚被 OTP 证明）", async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { ...SHADOW, user_metadata: { pending_email: "a@x.com", keep: 1 } } },
    });
    const r = await completeEmailAttach({ tgUid: "u1", bearerToken: "tok" });
    expect(r).toEqual({ ok: true });
    expect(getUserMock).toHaveBeenCalledWith("tok");
    expect(deleteUserMock).toHaveBeenCalledWith("orphan");
    expect(updateUserByIdMock).toHaveBeenCalledWith("u1", {
      email: "a@x.com",
      email_confirm: true,
      user_metadata: { keep: 1 }, // pending 键已清除，其余 metadata 保留
    });
  });

  it("持票人就是目标账号本人（邮箱已在账号上）→ 幂等 ok：不 deleteUser，只清意向", async () => {
    getUserMock.mockResolvedValue({ data: { user: orphanProof({ id: "u1" }) } });
    getUserByIdMock.mockResolvedValue({
      data: { user: { ...SHADOW, email: "a@x.com", user_metadata: { pending_email: "a@x.com" } } },
    });
    const r = await completeEmailAttach({ tgUid: "u1", bearerToken: "tok" });
    expect(r).toEqual({ ok: true });
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(updateUserByIdMock).toHaveBeenCalledWith("u1", { user_metadata: {} });
  });

  it("无匹配 pending 意向 → no_pending，零写入（普通登录路过 callback 的常态路径）", async () => {
    const r = await completeEmailAttach({ tgUid: "u1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "no_pending" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("持票邮箱未验证（无 email_confirmed_at）→ unverified，不构成所有权证明", async () => {
    getUserMock.mockResolvedValue({ data: { user: orphanProof({ email_confirmed_at: null }) } });
    const r = await completeEmailAttach({ tgUid: "u1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "unverified" });
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("持票方是老账号而非 OTP 新建孤儿 → taken，绝不 deleteUser（删账号守卫）", async () => {
    getUserMock.mockResolvedValue({
      data: { user: orphanProof({ created_at: "2020-01-01T00:00:00Z" }) },
    });
    getUserByIdMock.mockResolvedValue({
      data: { user: { ...SHADOW, user_metadata: { pending_email: "a@x.com" } } },
    });
    const r = await completeEmailAttach({ tgUid: "u1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "taken" });
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("占用复查：邮箱被第三个账号持有 → taken，不动孤儿", async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { ...SHADOW, user_metadata: { pending_email: "a@x.com" } } },
    });
    listUsersMock.mockResolvedValue({ data: { users: [{ id: "u3", email: "a@x.com" }] } });
    const r = await completeEmailAttach({ tgUid: "u1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "taken" });
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("跨浏览器点击（无 TG cookie）→ 按 pending_email 意向反查定位目标账号", async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [{ id: "u9", email: "tg_555@zhaojian.local", user_metadata: { pending_email: "a@x.com" } }] },
    });
    getUserByIdMock.mockResolvedValue({
      data: { user: { ...SHADOW, id: "u9", user_metadata: { pending_email: "a@x.com" } } },
    });
    const r = await completeEmailAttach({ tgUid: null, bearerToken: "tok" });
    expect(r).toEqual({ ok: true });
    expect(updateUserByIdMock).toHaveBeenCalledWith("u9", {
      email: "a@x.com",
      email_confirm: true,
      user_metadata: {},
    });
  });
});

describe("attachIdentity · telegram 分支", () => {
  it("该 tg id 未被任何账号绑定 → 建映射", async () => {
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999, username: "bob" });
    expect(r).toEqual({ ok: true });
    expect(tgInsertMock).toHaveBeenCalledWith({ tg_user_id: 999, supabase_user_id: "u1", username: "bob" });
  });

  it("本账号已绑过别的 TG → already_attached（S3 前置反查，不再撞唯一索引返 500）", async () => {
    tgByUidMock.mockResolvedValue({ data: { tg_user_id: 555 } });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: false, error: "already_attached" });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });

  it("该 tg id 已绑定给别的账号 → already_attached（409 语义，不覆盖）", async () => {
    tgByTgIdMock.mockResolvedValue({ data: { supabase_user_id: "other-uid" } });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: false, error: "already_attached" });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });

  it("该 tg id 已绑定给自己 → 视为成功（幂等，不重复插入）", async () => {
    tgByUidMock.mockResolvedValue({ data: { tg_user_id: 999 } });
    tgByTgIdMock.mockResolvedValue({ data: { supabase_user_id: "u1" } });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: true });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });
});

describe("attachIdentity · 尚未实装的 provider", () => {
  it("google/apple 明确抛「未实装」而不是静默失败——本轮只留接缝（spec §8）", async () => {
    await expect(
      attachIdentity("u1", { kind: "google" } as never),
    ).rejects.toThrow(/未实装|not implemented/i);
  });
});
