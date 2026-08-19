// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
vi.mock("@/lib/tg/admin", () => ({ supabaseAdmin: () => ({ auth: { getUser: (...a: unknown[]) => getUserMock(...a) } }) }));

const resolveAccessMock = vi.fn();
vi.mock("@/lib/access", () => ({ resolveAccess: (...a: unknown[]) => resolveAccessMock(...a) }));

const consumeLlmMock = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
vi.mock("@/lib/entitlements", () => ({ consumeLlm: (...a: unknown[]) => consumeLlmMock(...a) }));

const isLlmConfiguredMock = vi.fn(() => true);
const generateSpiritIntroSpy = vi.fn(async (..._a: unknown[]) => ({ text: "你好", model: "m" }));
const streamSpiritChatSpy = vi.fn(async function* () {
  yield "回复";
});
vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "minimax", model: "m" })),
  isLlmConfigured: () => isLlmConfiguredMock(),
  generateSpiritIntro: (...a: unknown[]) => generateSpiritIntroSpy(...a),
  streamSpiritChat: (...a: unknown[]) => streamSpiritChatSpy(...(a as [])),
}));
vi.mock("@/lib/i18n/server", () => ({ localeFromRequest: () => "zh" }));

const { POST } = await import("../route");

function req(body: unknown, authorization?: string): Request {
  return new Request("http://x/api/spirit/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  isLlmConfiguredMock.mockReturnValue(true);
  consumeLlmMock.mockResolvedValue({ ok: true });
  resolveAccessMock.mockResolvedValue({ level: "identified", hasVerifiedEmail: false, hasTelegram: true });
});

describe("POST /api/spirit/chat：未识别身份必须拒绝，不得静默放行（EP-account2-05）", () => {
  it("无 Authorization header、有真实用户消息 → 401，且不调用 consumeLlm/streamSpiritChat（锁死原 if(userId) 漏洞）", async () => {
    const res = await POST(req({ chart: {}, messages: [{ role: "user", content: "嗨" }] }));
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expect(streamSpiritChatSpy).not.toHaveBeenCalled();
  });

  it("有 Bearer 但 getUser 解析不出用户 → 401，不放行", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const res = await POST(req({ chart: {}, messages: [{ role: "user", content: "嗨" }] }, "Bearer bad-token"));
    expect(res.status).toBe(401);
    expect(streamSpiritChatSpy).not.toHaveBeenCalled();
  });

  it("有 Bearer、能解析出 uid，但 resolveAccess 判定为 anonymous → 401（裸 uid 不等于已识别）", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    resolveAccessMock.mockResolvedValue({ level: "anonymous", hasVerifiedEmail: false, hasTelegram: false });
    const res = await POST(req({ chart: {}, messages: [{ role: "user", content: "嗨" }] }, "Bearer tok"));
    expect(res.status).toBe(401);
    expect(consumeLlmMock).not.toHaveBeenCalled();
  });

  it("有 Bearer、resolveAccess 判定为 identified → 正常走 consumeLlm + streamSpiritChat", async () => {
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    const res = await POST(req({ chart: {}, messages: [{ role: "user", content: "嗨" }] }, "Bearer tok"));
    expect(res.status).toBe(200);
    expect(consumeLlmMock).toHaveBeenCalledWith("u1");
    expect(streamSpiritChatSpy).toHaveBeenCalled();
  });

  it("开场白（无用户消息）不受此闸门约束——不识别身份也能拿开场白，不消耗额度（既有行为不变）", async () => {
    const res = await POST(req({ chart: {}, messages: [] }));
    expect(res.status).toBe(200);
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expect(generateSpiritIntroSpy).toHaveBeenCalled();
  });

  it("伪造的全 spirit 角色历史（无 user 消息）不得绕过闸门 → 401，且不调用 streamSpiritChat/consumeLlm（锁死 isIntro 判定错位）", async () => {
    const res = await POST(req({ chart: {}, messages: [{ role: "spirit", content: "x" }] }));
    expect(res.status).toBe(401);
    expect(streamSpiritChatSpy).not.toHaveBeenCalled();
    expect(consumeLlmMock).not.toHaveBeenCalled();
    expect(generateSpiritIntroSpy).not.toHaveBeenCalled();
  });
});
