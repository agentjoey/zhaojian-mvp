// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ from: () => ({ insert: (...a: unknown[]) => insertMock(...a) }) }),
}));

const { recordConsentOnce } = await import("../consent");

beforeEach(() => vi.clearAllMocks());

describe("recordConsentOnce", () => {
  it("正常插入：带 user_id/document/version", async () => {
    insertMock.mockResolvedValue({ error: null });
    await recordConsentOnce("u1", "terms", "2026-08-20");
    expect(insertMock).toHaveBeenCalledWith(
      { user_id: "u1", document: "terms", version: "2026-08-20" },
      { count: undefined },
    );
  });

  it("重复调用（唯一约束冲突）不抛错——幂等，同一 (uid, document, version) 只留一条", async () => {
    insertMock.mockResolvedValue({ error: { code: "23505", message: "duplicate key" } });
    await expect(recordConsentOnce("u1", "terms", "2026-08-20")).resolves.toBeUndefined();
  });

  it("其他数据库错误也不抛错——记录条款接受不该阻断调用方的主流程（best-effort）", async () => {
    insertMock.mockResolvedValue({ error: { code: "500", message: "db down" } });
    await expect(recordConsentOnce("u1", "terms", "2026-08-20")).resolves.toBeUndefined();
  });
});
