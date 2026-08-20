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

/** email_bind_pending 表的可控状态。 */
const pending = {
  row: null as null | Record<string, unknown>,
  insert: vi.fn(),
  deleted: [] as unknown[],
  /** update(...).eq(id).is(consumed_at,null).select() 的返回——[] 表示已被别人消费掉。 */
  claimResult: [{ id: "pend1" }] as unknown[],
  claimPayloads: [] as unknown[],
};

/** profiles / spirit_messages 的计数（孤儿是否「有数据」）。 */
const counts = { profiles: 0, spirit_messages: 0 };

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
    from: (table: string) => {
      if (table === "email_bind_pending") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: pending.row, error: null }) }) }),
          insert: (...a: unknown[]) => {
            pending.insert(...a);
            return Promise.resolve({ error: null });
          },
          update: (payload: unknown) => {
            pending.claimPayloads.push(payload);
            return {
              eq: () => ({
                is: () => ({ select: async () => ({ data: pending.claimResult, error: null }) }),
              }),
            };
          },
          delete: () => ({
            eq: () => ({
              is: async () => {
                pending.deleted.push(true);
                return { error: null };
              },
            }),
          }),
        };
      }
      if (table === "profiles" || table === "spirit_messages") {
        return {
          select: () => ({ eq: async () => ({ count: counts[table], error: null }) }),
        };
      }
      // tg_users
      return {
        select: () => ({
          eq: (field: string) => ({
            maybeSingle: () => (field === "tg_user_id" ? tgByTgIdMock() : tgByUidMock()),
          }),
        }),
        insert: (...a: unknown[]) => tgInsertMock(...a),
      };
    },
  }),
}));

const { attachIdentity, completeEmailAttach, peekEmailBind } = await import("../identity-link");

/** 线上影子用户的典型形态：合成邮箱 + email_confirmed_at 已填充（建号时 email_confirm:true）。 */
const SHADOW = {
  id: "u1",
  email: "tg_999@zhaojian.local",
  email_confirmed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
};

function proofUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "orphan",
    email: "a@x.com",
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function pendingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pend1",
    user_id: "u1",
    email: "a@x.com",
    created_at: new Date().toISOString(),
    consumed_at: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listUsersMock.mockResolvedValue({ data: { users: [], nextPage: null } });
  getUserByIdMock.mockResolvedValue({ data: { user: { ...SHADOW } } });
  updateUserByIdMock.mockResolvedValue({ error: null });
  deleteUserMock.mockResolvedValue({ error: null });
  getUserMock.mockResolvedValue({ data: { user: proofUser() } });
  tgByTgIdMock.mockResolvedValue({ data: null, error: null });
  tgByUidMock.mockResolvedValue({ data: null, error: null });
  tgInsertMock.mockResolvedValue({ error: null });
  pending.row = pendingRow();
  pending.insert.mockClear();
  pending.deleted = [];
  pending.claimResult = [{ id: "pend1" }];
  pending.claimPayloads = [];
  counts.profiles = 0;
  counts.spirit_messages = 0;
});

describe("attachIdentity · email 阶段 1（prepare：只校验 + 发 nonce）", () => {
  it("影子用户绑新邮箱 → 回 nonce；绝不提前写 email 字段（阻断 1 核心断言）", async () => {
    const r = (await attachIdentity("u1", { kind: "email", email: "a@x.com" })) as { ok: true; nonce: string };
    expect(r.ok).toBe(true);
    expect(typeof r.nonce).toBe("string");
    expect(r.nonce.length).toBeGreaterThanOrEqual(32);
    expect(pending.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "u1", email: "a@x.com", nonce: r.nonce }),
    );
    // 实测：updateUserById 写 email 不清 confirmed_at（email_confirm:false 也不清），
    // 提前写字段 = 未验证却被 resolveAccess 判成已验证。锁死「prepare 永不碰 auth 用户」。
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("nonce 每次都不同（可预测的 nonce 等于没有 nonce）", async () => {
    const a = (await attachIdentity("u1", { kind: "email", email: "a@x.com" })) as { nonce: string };
    const b = (await attachIdentity("u1", { kind: "email", email: "a@x.com" })) as { nonce: string };
    expect(a.nonce).not.toBe(b.nonce);
  });

  it("发新 nonce 前作废本账号旧的未消费意向（避免两个都能用）", async () => {
    await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(pending.deleted.length).toBe(1);
  });

  it("本账号已有别的真实已验证邮箱 → already_attached，零写入（S3）", async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { ...SHADOW, email: "old@x.com", email_confirmed_at: "2026-01-01T00:00:00Z" } },
    });
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: false, error: "already_attached" });
    expect(pending.insert).not.toHaveBeenCalled();
  });

  it("邮箱被别的账号占用 → taken；占用检查必须翻页（用 nextPage 终止，不用「本页条数<请求量」）", async () => {
    listUsersMock.mockImplementation(({ page = 1 }: { page?: number }) =>
      Promise.resolve({
        data:
          page === 1
            ? { users: Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, email: `p${i}@x.com` })), nextPage: 2 }
            : { users: [{ id: "u2", email: "a@x.com" }], nextPage: null },
      }),
    );
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: false, error: "taken" });
    // 第一页只有 3 条（远少于请求的 200）——旧的「短页即终止」写法会在这里 fail-open
    expect(listUsersMock).toHaveBeenCalledTimes(2);
  });
});

describe("completeEmailAttach · email 阶段 2（nonce 兑换）", () => {
  it("nonce 有效 + 持票邮箱匹配 + 孤儿无数据 → 释放地址（改名，不删号）后写入目标", async () => {
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: true });
    // 破坏性操作必须是「改名」而不是「删号」——删号不可逆，第二步失败即数据丢失
    expect(deleteUserMock).not.toHaveBeenCalled();
    expect(updateUserByIdMock).toHaveBeenNthCalledWith(1, "orphan", {
      email: "released_orphan@zhaojian.local",
    });
    expect(updateUserByIdMock).toHaveBeenNthCalledWith(2, "u1", { email: "a@x.com", email_confirm: true });
  });

  it("🔴 攻击回归：别人预埋的意向不能被一次普通注册兑换——nonce 不匹配即拒绝，零写入", async () => {
    // 攻击者为「尚未注册的 victim@x.com」预埋了意向（pending.row 指向攻击者账号）。
    // 受害者日后正常注册该邮箱、点自己的登录链接——那条链接里**没有 bind nonce**，
    // 于是根本走不到 complete；即便被诱导传入一个不存在的 nonce，也必须拒绝。
    pending.row = null; // 该 nonce 查无此意向
    getUserMock.mockResolvedValue({ data: { user: proofUser({ id: "victim", email: "victim@x.com" }) } });
    const r = await completeEmailAttach({ nonce: "不存在的nonce", bearerToken: "victim-tok" });
    expect(r).toEqual({ ok: false, error: "no_pending" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("🔴 攻击回归：持票邮箱与 nonce 声明的邮箱不一致 → email_mismatch，零写入", async () => {
    // 拿自己的已验证邮箱 + 偷来的别人的 nonce，不能兑换成绑定。
    pending.row = pendingRow({ email: "victim@x.com" });
    getUserMock.mockResolvedValue({ data: { user: proofUser({ id: "att", email: "attacker@x.com" }) } });
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "email_mismatch" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("意向已消费 → no_pending（单次消费），零写入", async () => {
    pending.row = pendingRow({ consumed_at: new Date().toISOString() });
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "no_pending" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("意向已过期（>15 分钟）→ no_pending，零写入（旧设计的意向永不过期）", async () => {
    pending.row = pendingRow({ created_at: new Date(Date.now() - 16 * 60 * 1000).toISOString() });
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "no_pending" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("并发第二次点击：占坑更新影响 0 行 → no_pending，不重复执行", async () => {
    pending.claimResult = [];
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "no_pending" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("持票邮箱未验证 → unverified，零写入（所有权证明不成立）", async () => {
    getUserMock.mockResolvedValue({ data: { user: proofUser({ email_confirmed_at: null }) } });
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "unverified" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("🔴 持票账号名下有档案 → orphan_has_data，绝不动它（防误伤真实账号）", async () => {
    counts.profiles = 2;
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "orphan_has_data" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it("持票账号有对话记录 → 同样拒绝（profiles 为空不等于空壳）", async () => {
    counts.spirit_messages = 1;
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "orphan_has_data" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("持票方就是目标账号本人（邮箱已在目标上）→ 幂等 ok，不做任何转移", async () => {
    getUserMock.mockResolvedValue({ data: { user: proofUser({ id: "u1" }) } });
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: true });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("目标账号期间已绑上别的真实已验证邮箱 → already_attached，不动持票方", async () => {
    getUserByIdMock.mockResolvedValue({
      data: { user: { ...SHADOW, email: "other@x.com", email_confirmed_at: "2026-01-01T00:00:00Z" } },
    });
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "already_attached" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("写入目标失败 → 补偿把地址还回持票方（可逆性是选改名而非删号的理由）", async () => {
    updateUserByIdMock
      .mockResolvedValueOnce({ error: null }) // 释放地址成功
      .mockResolvedValueOnce({ error: { message: "boom" } }) // 写入目标失败
      .mockResolvedValueOnce({ error: null }); // 补偿
    const r = await completeEmailAttach({ nonce: "n1", bearerToken: "tok" });
    expect(r).toEqual({ ok: false, error: "send_failed" });
    expect(updateUserByIdMock).toHaveBeenNthCalledWith(3, "orphan", { email: "a@x.com" });
  });
});

describe("peekEmailBind（确认屏只读预览，不消费）", () => {
  it("有效意向 → 回邮箱，且不消费（consumed_at 不被写）", async () => {
    const r = await peekEmailBind("n1", "orphan");
    expect(r).toEqual({ ok: true, preview: { email: "a@x.com", targetIsCurrentUser: false } });
    expect(pending.claimPayloads).toHaveLength(0);
  });

  it("过期意向 → no_pending", async () => {
    pending.row = pendingRow({ created_at: new Date(Date.now() - 16 * 60 * 1000).toISOString() });
    expect(await peekEmailBind("n1", "orphan")).toEqual({ ok: false, error: "no_pending" });
  });
});

describe("attachIdentity · telegram 分支", () => {
  it("未被占用 → 建映射", async () => {
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999, username: "bob" });
    expect(r).toEqual({ ok: true });
    expect(tgInsertMock).toHaveBeenCalledWith({ tg_user_id: 999, supabase_user_id: "u1", username: "bob" });
  });

  it("本账号已绑别的 TG → already_attached（409），不撞唯一索引（S3）", async () => {
    tgByUidMock.mockResolvedValue({ data: { tg_user_id: 111 }, error: null });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: false, error: "already_attached" });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });

  it("同一个 TG 重绑自己 → 幂等 ok", async () => {
    tgByUidMock.mockResolvedValue({ data: { tg_user_id: 999 }, error: null });
    tgByTgIdMock.mockResolvedValue({ data: { supabase_user_id: "u1" }, error: null });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: true });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });

  it("该 TG 已绑给别人 → already_attached", async () => {
    tgByTgIdMock.mockResolvedValue({ data: { supabase_user_id: "other" }, error: null });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: false, error: "already_attached" });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });

  it("前置反查报错 → send_failed，不当作「没绑过」放行（NEW-6：静默吞错等于绕过校验）", async () => {
    tgByUidMock.mockResolvedValue({ data: null, error: { message: "db down" } });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: false, error: "send_failed" });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });
});

describe("attachIdentity · 未实装的 provider", () => {
  it("google/apple 明确抛错，不静默失败", async () => {
    await expect(attachIdentity("u1", { kind: "google" })).rejects.toThrow(/未实装/);
  });
});
