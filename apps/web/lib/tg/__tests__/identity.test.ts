// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const createUserMock = vi.fn();
const tgInsertMock = vi.fn();
const tgSelectMaybeSingleMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({
    auth: { admin: { createUser: (...a: unknown[]) => createUserMock(...a) } },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => tgSelectMaybeSingleMock() }) }),
      insert: (...a: unknown[]) => tgInsertMock(...a),
      update: () => ({ eq: () => ({}) }),
    }),
  }),
}));
vi.mock("@/lib/consent", () => ({ recordConsentOnce: vi.fn(), TERMS_VERSION: "2026-08-20" }));
vi.mock("@/lib/entitlements", () => ({ getEntitlement: vi.fn(), isMember: vi.fn(() => false) }));

const { resolveOrCreateTgUser } = await import("../identity");

beforeEach(() => {
  vi.clearAllMocks();
  tgSelectMaybeSingleMock.mockResolvedValue({ data: null });
  tgInsertMock.mockResolvedValue({ error: null });
});

describe("resolveOrCreateTgUser：合成邮箱域名与 SYNTHETIC_EMAIL_DOMAIN 一致（EP-account2-08，实测分支 2b）", () => {
  it("createUser 的 email 用的是共享常量拼出来的域名，不是散落的字面量", async () => {
    const { SYNTHETIC_EMAIL_DOMAIN } = await import("@/lib/access");
    createUserMock.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await resolveOrCreateTgUser({ id: 999 });
    const args = createUserMock.mock.calls[0]![0] as { email: string };
    expect(args.email).toBe(`tg_999@${SYNTHETIC_EMAIL_DOMAIN}`);
  });
});
