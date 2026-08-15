// @vitest-environment node
//
// 与 app/api/fengshui/reading/__tests__/route.test.ts 同一种测法：直接 import 路由
// 处理函数、拿 Node 原生 Request 调用，不经过 Next 的开发/构建服务器。这也是本路由
// 从 `req.headers` 读 cookie（而非 next/headers 的 cookies()）的原因。
//
// EP-fs-tg：TG 中介端点的鉴权（401）、归属校验（uid 只来自 session）、入参校验
// （400）、错误码（503/500/402）都在本文件覆盖。supabaseAdmin 用可编程 mock——
// 每条链式调用记录参数，测试据此断言「查询带了 session uid」而不是信任客户端
// 传来的任何 id。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const SESSION = { uid: "u-tg-1", tgId: 12345 };
const readSessionMock = vi.fn<(...args: unknown[]) => { uid: string; tgId: number } | null>(() => SESSION);
vi.mock("@/lib/tg/session", () => ({
  TG_COOKIE: "zj_tg",
  readSession: (...a: unknown[]) => readSessionMock(...a),
}));

/**
 * 可编程 supabaseAdmin mock。`tables[表名]` 挂每条测试自己准备的响应；
 * `calls` 按顺序记录所有链式调用（方法名 + 参数），断言「归属过滤带了 session
 * 的 uid」「插入的 uid 是 session 的而不是 body 里的」都靠它。
 */
const { db } = vi.hoisted(() => {
  type Call = { method: string; args: unknown[]; table: string };
  const db = {
    calls: [] as Call[],
    /** 表名 → 各终止方法（select/single/maybeSingle/upsert 等）的返回队列 */
    results: {} as Record<string, { data: unknown; error: unknown }>,
  };
  return { db };
});

function chain(table: string): Record<string, unknown> {
  const record = (method: string, args: unknown[]) => db.calls.push({ method, args, table });
  const self: Record<string, unknown> = {};
  for (const m of ["select", "insert", "update", "delete", "upsert", "eq", "in", "order"]) {
    self[m] = (...args: unknown[]) => {
      record(m, args);
      return self;
    };
  }
  for (const m of ["single", "maybeSingle"]) {
    self[m] = async (...args: unknown[]) => {
      record(m, args);
      return db.results[table] ?? { data: null, error: null };
    };
  }
  // 无终止方法的链（如 delete().eq().eq()）以 thenable 收尾
  self.then = (resolve: (v: unknown) => void) => resolve(db.results[table] ?? { data: null, error: null });
  return self;
}

vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ from: (table: string) => chain(table) }),
}));

const getEntitlementMock = vi.fn(async (..._a: unknown[]) => ({ tier: "free", memberUntil: null as string | null }));
const isMemberMock = vi.fn((..._a: unknown[]) => false);
vi.mock("@/lib/entitlements", () => ({
  getEntitlement: (...a: unknown[]) => getEntitlementMock(...a),
  isMember: (...a: unknown[]) => isMemberMock(...a),
}));

const isLlmConfiguredMock = vi.fn((..._a: unknown[]) => true);
const generateFengshuiReadingMock = vi.fn(async (..._a: unknown[]) => ({
  sections: { situation: "S", youAndSpace: "Y", actions: "A" },
  degraded: false,
  markdown: "",
  corrections: [],
}));
vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "anthropic" })),
  isLlmConfigured: () => isLlmConfiguredMock(),
  generateFengshuiReading: (...a: unknown[]) => generateFengshuiReadingMock(...a),
}));

const { GET, POST } = await import("../route");

function reqWithSession(url: string, init?: RequestInit): Request {
  return new Request(url, {
    ...init,
    headers: { cookie: "zj_tg=fake-token", ...(init?.headers as Record<string, string>) },
  });
}

function post(body: unknown, withSession = true): Request {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
  return withSession
    ? reqWithSession("http://x/api/tg/fengshui", init)
    : new Request("http://x/api/tg/fengshui", init);
}

const VALID_DWELLING = {
  name: "家", kind: "home", tenancy: "rent", facing: "S", memberProfileIds: [],
};

beforeEach(() => {
  db.calls.length = 0;
  db.results = {};
  readSessionMock.mockReset().mockReturnValue(SESSION);
  isLlmConfiguredMock.mockReset().mockReturnValue(true);
  generateFengshuiReadingMock.mockClear();
  getEntitlementMock.mockClear();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("EP-fs-tg /api/tg/fengshui 鉴权", () => {
  it("无 TG session：GET 401", async () => {
    readSessionMock.mockReturnValue(null);
    const r = await GET(new Request("http://x/api/tg/fengshui"));
    expect(r.status).toBe(401);
  });

  it("无 TG session：POST 401，且不触碰数据库", async () => {
    readSessionMock.mockReturnValue(null);
    const r = await POST(post({ action: "dwellings.delete", id: "d1" }, false));
    expect(r.status).toBe(401);
    expect(db.calls).toHaveLength(0);
  });
});

describe("EP-fs-tg 居所 CRUD", () => {
  it("GET 列表：按 session uid 过滤，行映射为 Dwelling", async () => {
    db.results["dwellings"] = {
      data: [{
        id: "d1", name: "家", kind: "home", tenancy: "rent",
        facing: "S", member_profile_ids: ["p2"],
      }],
      error: null,
    };
    const r = await GET(reqWithSession("http://x/api/tg/fengshui"));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.dwellings).toEqual([{
      id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S", memberProfileIds: ["p2"],
    }]);
    // 归属过滤：uid 必须来自 session
    const eqUid = db.calls.find((c) => c.table === "dwellings" && c.method === "eq" && c.args[0] === "uid");
    expect(eqUid?.args[1]).toBe("u-tg-1");
  });

  it("dwellings.create：插入行的 uid 用 session 的——body 里塞别人的 uid 也没用", async () => {
    db.results["dwellings"] = {
      data: {
        id: "d9", name: "家", kind: "home", tenancy: "rent", facing: "S", member_profile_ids: [],
      },
      error: null,
    };
    const r = await POST(post({
      action: "dwellings.create",
      dwelling: { ...VALID_DWELLING, uid: "u-victim" },
    }));
    expect(r.status).toBe(200);
    const insert = db.calls.find((c) => c.table === "dwellings" && c.method === "insert");
    expect((insert?.args[0] as Record<string, unknown>).uid).toBe("u-tg-1");
  });

  it("dwellings.create：入参非法（facing 不是方位枚举）→ 400，不写库", async () => {
    const r = await POST(post({
      action: "dwellings.create",
      dwelling: { ...VALID_DWELLING, facing: "SSW" },
    }));
    expect(r.status).toBe(400);
    expect(db.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("dwellings.create：同住人档案不属于当前用户 → 400，不写库", async () => {
    // profiles 归属查询只返回 p2——body 里的 p-other 不在其中
    db.results["profiles"] = { data: [{ id: "p2" }], error: null };
    const r = await POST(post({
      action: "dwellings.create",
      dwelling: { ...VALID_DWELLING, memberProfileIds: ["p2", "p-other"] },
    }));
    expect(r.status).toBe(400);
    expect(db.calls.find((c) => c.method === "insert")).toBeUndefined();
  });

  it("dwellings.update：更新限定 id + session uid；没命中任何行 → 400", async () => {
    db.results["dwellings"] = { data: [], error: null }; // select 收尾返回空 = 未命中
    const r = await POST(post({ action: "dwellings.update", id: "d1", patch: { name: "新家" } }));
    expect(r.status).toBe(400);
    const eqs = db.calls.filter((c) => c.table === "dwellings" && c.method === "eq");
    expect(eqs).toContainEqual(expect.objectContaining({ args: ["id", "d1"] }));
    expect(eqs).toContainEqual(expect.objectContaining({ args: ["uid", "u-tg-1"] }));
  });

  it("dwellings.delete：删除限定 id + session uid", async () => {
    const r = await POST(post({ action: "dwellings.delete", id: "d1" }));
    expect(r.status).toBe(200);
    const eqs = db.calls.filter((c) => c.table === "dwellings" && c.method === "eq");
    expect(eqs).toContainEqual(expect.objectContaining({ args: ["id", "d1"] }));
    expect(eqs).toContainEqual(expect.objectContaining({ args: ["uid", "u-tg-1"] }));
  });

  it("未知 action → 400", async () => {
    const r = await POST(post({ action: "dwellings.explode" }));
    expect(r.status).toBe(400);
  });
});

describe("EP-fs-tg 报告读写", () => {
  it("GET ?fingerprint：命中返回 sections，未命中返回 null", async () => {
    db.results["fengshui_reports"] = {
      data: { sections: { situation: "S", youAndSpace: "Y", actions: "A" } },
      error: null,
    };
    const hit = await GET(reqWithSession("http://x/api/tg/fengshui?fingerprint=fsabc"));
    expect((await hit.json()).sections).toEqual({ situation: "S", youAndSpace: "Y", actions: "A" });
    expect(db.calls).toContainEqual(expect.objectContaining({
      table: "fengshui_reports", method: "eq", args: ["uid", "u-tg-1"],
    }));

    db.calls.length = 0;
    db.results["fengshui_reports"] = { data: null, error: null };
    const miss = await GET(reqWithSession("http://x/api/tg/fengshui?fingerprint=fszzz"));
    expect((await miss.json()).sections).toBeNull();
  });

  it("report.save：upsert 的 uid 用 session 的", async () => {
    db.results["profiles"] = { data: [{ id: "p1" }], error: null };
    const r = await POST(post({
      action: "report.save",
      fingerprint: "fsabc", profileId: "p1", dwellingId: null,
      layer: 0, locale: "zh",
      sections: { situation: "S", youAndSpace: "Y", actions: "A" },
    }));
    expect(r.status).toBe(200);
    const upsert = db.calls.find((c) => c.table === "fengshui_reports" && c.method === "upsert");
    expect((upsert?.args[0] as Record<string, unknown>).uid).toBe("u-tg-1");
  });

  it("report.save：档案不属于当前用户 → 400，不写库", async () => {
    db.results["profiles"] = { data: [], error: null }; // 归属查询为空
    const r = await POST(post({
      action: "report.save",
      fingerprint: "fsabc", profileId: "p-other", dwellingId: null,
      layer: 0, locale: "zh",
      sections: { situation: "S", youAndSpace: "Y", actions: "A" },
    }));
    expect(r.status).toBe(400);
    expect(db.calls.find((c) => c.method === "upsert")).toBeUndefined();
  });

  it("report.save：带了别人的 dwellingId → 400", async () => {
    db.results["profiles"] = { data: [{ id: "p1" }], error: null };
    db.results["dwellings"] = { data: [], error: null }; // 居所归属校验未命中
    const r = await POST(post({
      action: "report.save",
      fingerprint: "fsabc", profileId: "p1", dwellingId: "d-other",
      layer: 1, locale: "zh",
      sections: { situation: "S", youAndSpace: "Y", actions: "A" },
    }));
    expect(r.status).toBe(400);
    expect(db.calls.find((c) => c.method === "upsert")).toBeUndefined();
  });
});

describe("EP-fs-tg 报告生成（reading action）", () => {
  const birth = { date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false };

  it("LLM 未配置 → 503", async () => {
    isLlmConfiguredMock.mockReturnValue(false);
    const r = await POST(post({ action: "reading", ...birth }));
    expect(r.status).toBe(503);
  });

  it("入参非法 → 400", async () => {
    const r = await POST(post({ action: "reading", date: "not-a-date" }));
    expect(r.status).toBe(400);
  });

  it("Layer 0 正常生成 → 200 { sections, degraded }", async () => {
    const r = await POST(post({ action: "reading", ...birth }));
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.sections).toEqual({ situation: "S", youAndSpace: "Y", actions: "A" });
    expect(j.degraded).toBe(false);
    expect(generateFengshuiReadingMock).toHaveBeenCalled();
  });

  it("Layer 1（带 dwelling）+ BILLING_ENABLED=1 + 非会员 → 402，不调 LLM", async () => {
    vi.stubEnv("BILLING_ENABLED", "1");
    isMemberMock.mockReturnValue(false);
    const r = await POST(post({
      action: "reading", ...birth,
      dwelling: { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S" },
    }));
    expect(r.status).toBe(402);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
    // 闸门查的是 session 的 uid
    expect(getEntitlementMock).toHaveBeenCalledWith("u-tg-1");
  });

  it("Layer 1 + BILLING_ENABLED=1 + 会员 → 放行", async () => {
    vi.stubEnv("BILLING_ENABLED", "1");
    isMemberMock.mockReturnValue(true);
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2099-01-01" });
    const r = await POST(post({
      action: "reading", ...birth,
      dwelling: { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S" },
    }));
    expect(r.status).toBe(200);
  });

  it("BILLING_ENABLED 未设置（默认）：Layer 1 也放行——与 web 路由同一规则", async () => {
    const r = await POST(post({
      action: "reading", ...birth,
      dwelling: { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S" },
    }));
    expect(r.status).toBe(200);
  });

  it("生成抛错 → 500", async () => {
    generateFengshuiReadingMock.mockRejectedValueOnce(new Error("llm down"));
    const r = await POST(post({ action: "reading", ...birth }));
    expect(r.status).toBe(500);
  });
});

describe("EP-fs-tg 评审 M3：重复 memberProfileIds 按集合语义校验", () => {
  it("[\"p2\",\"p2\"] 且 p2 属于本人 → 放行（.in() 去重不应误杀合法重复）", async () => {
    db.results["profiles"] = { data: [{ id: "p2" }], error: null };
    db.results["dwellings"] = {
      data: {
        id: "d9", name: "家", kind: "home", tenancy: "rent", facing: "S",
        member_profile_ids: ["p2", "p2"],
      },
      error: null,
    };
    const r = await POST(post({
      action: "dwellings.create",
      dwelling: { ...VALID_DWELLING, memberProfileIds: ["p2", "p2"] },
    }));
    expect(r.status).toBe(200);
  });
});
