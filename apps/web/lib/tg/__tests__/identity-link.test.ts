// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const listUsersMock = vi.fn();
const updateUserByIdMock = vi.fn();
const generateLinkMock = vi.fn();
const tgSelectMaybeSingleMock = vi.fn();
const tgInsertMock = vi.fn();

vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: {
      admin: {
        listUsers: (...a: unknown[]) => listUsersMock(...a),
        updateUserById: (...a: unknown[]) => updateUserByIdMock(...a),
        generateLink: (...a: unknown[]) => generateLinkMock(...a),
      },
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => tgSelectMaybeSingleMock() }) }),
      insert: (...a: unknown[]) => tgInsertMock(...a),
    }),
  }),
}));

const { attachIdentity } = await import("../identity-link");

beforeEach(() => {
  vi.clearAllMocks();
  listUsersMock.mockResolvedValue({ data: { users: [] } });
  updateUserByIdMock.mockResolvedValue({ error: null });
  generateLinkMock.mockResolvedValue({ error: null });
  tgSelectMaybeSingleMock.mockResolvedValue({ data: null });
  tgInsertMock.mockResolvedValue({ error: null });
});

describe("attachIdentity · email 分支", () => {
  it("邮箱未被占用 → 更新 email + 发 magic link", async () => {
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: true });
    expect(updateUserByIdMock).toHaveBeenCalledWith("u1", { email: "a@x.com" });
    expect(generateLinkMock).toHaveBeenCalledWith({ type: "magiclink", email: "a@x.com" });
  });

  it("邮箱已被别的账号占用 → taken（不调用 updateUserById）", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [{ id: "u2", email: "a@x.com" }] } });
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: false, error: "taken" });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
  });

  it("邮箱已经是这个账号自己的（同 uid）→ 不算占用，正常放行", async () => {
    listUsersMock.mockResolvedValue({ data: { users: [{ id: "u1", email: "a@x.com" }] } });
    const r = await attachIdentity("u1", { kind: "email", email: "a@x.com" });
    expect(r).toEqual({ ok: true });
  });
});

describe("attachIdentity · telegram 分支", () => {
  it("该 tg id 未被任何账号绑定 → 建映射", async () => {
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999, username: "bob" });
    expect(r).toEqual({ ok: true });
    expect(tgInsertMock).toHaveBeenCalledWith({ tg_user_id: 999, supabase_user_id: "u1", username: "bob" });
  });

  it("该 tg id 已绑定给别的账号 → already_attached（409 语义，不覆盖）", async () => {
    tgSelectMaybeSingleMock.mockResolvedValue({ data: { supabase_user_id: "other-uid" } });
    const r = await attachIdentity("u1", { kind: "telegram", tgId: 999 });
    expect(r).toEqual({ ok: false, error: "already_attached" });
    expect(tgInsertMock).not.toHaveBeenCalled();
  });

  it("该 tg id 已绑定给自己 → 视为成功（幂等，不重复插入）", async () => {
    tgSelectMaybeSingleMock.mockResolvedValue({ data: { supabase_user_id: "u1" } });
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
