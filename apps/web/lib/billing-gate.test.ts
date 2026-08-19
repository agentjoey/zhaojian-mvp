// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveAccessMock = vi.fn();
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));

const { requireVerifiedEmailForPayment } = await import("./billing-gate");

beforeEach(() => vi.clearAllMocks());

describe("requireVerifiedEmailForPayment（EP-account2-05，供未来 checkout 路由调用）", () => {
  it("anonymous → not_identified", async () => {
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: false, reason: "not_identified" });
  });

  it("identified 但只有 TG、没有已验证邮箱 → no_verified_email（即使影子邮箱还带着 email_confirm=true，hasVerifiedEmail 也已经在 resolveAccess 里排除掉了）", async () => {
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: false, reason: "no_verified_email" });
  });

  it("identified 且 hasVerifiedEmail → ok", async () => {
    resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: true, hasTelegram: false });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: true });
  });

  it("已经是 member（自然蕴含 hasVerifiedEmail，见 resolveAccess 定义）→ ok", async () => {
    resolveAccessMock.mockResolvedValue({ level: "member", hasVerifiedEmail: true, hasTelegram: true });
    expect(await requireVerifiedEmailForPayment("u1")).toEqual({ ok: true });
  });
});
