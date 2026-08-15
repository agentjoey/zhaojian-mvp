// @vitest-environment node
//
// 路由处理函数在真实生产环境下跑在 Node.js runtime（route.ts 顶部
// `export const runtime = "nodejs"`），用标准 Fetch API 的 `Request`/`Response`。
// 这里用 `@vitest-environment node` 覆盖本文件的测试环境（其余测试仍走仓库默认的
// jsdom），直接拿 Node 原生 Request/Response 构造请求、调用 POST 处理函数——不经过
// Next 的开发/构建服务器，是最贴近路由处理函数真实运行时形态的单测方式。
//
// Task 14 复审必修2：本路由此前零测试。覆盖四条路径：LLM 未配置 503、入参非法 400、
// 正常路径返回 JSON（含 sections/degraded）、生成抛错 500。`@eamvp/llm` 整体 mock 掉，
// 避免真实网络调用；`@eamvp/core` 不 mock，让 computeUnifiedChart/computeFengshui
// 走真实计算（快、确定性，且能顺带验证 route 与 core 的接线没有断）。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BirthInputSchema, type FengshuiChart } from "@eamvp/core";

const isLlmConfiguredMock = vi.fn<(...args: unknown[]) => boolean>(() => true);
const generateFengshuiReadingMock = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock("@eamvp/llm", () => ({
  resolveLlmConfig: vi.fn(() => ({ provider: "anthropic", wire: "anthropic", model: "m", baseUrl: "http://x", apiKey: "k" })),
  isLlmConfigured: (...a: unknown[]) => isLlmConfiguredMock(...a),
  generateFengshuiReading: (...a: unknown[]) => generateFengshuiReadingMock(...a),
}));

/**
 * 会员闸门（Task 10，EP-fs-17）依赖两组外部信息：
 *  1) 用户是谁——`readSession`（TG cookie）与 `supabaseAdmin().auth.getUser`（Bearer 兜底），
 *     与 billing/status/route.ts 同一手法（见 route.ts 顶部注释：不用
 *     lib/account/uid.ts 的 resolveUid()，那个实现依赖 next/headers 的 cookies()，
 *     只有真正经 Next 路由分发时才有值，直接 import 路由函数调用的单测方式拿不到）。
 *  2) 用户是不是会员——`getEntitlement`/`isMember`。
 * 全部 mock 掉，逐条控制「谁在请求、是不是会员」，不依赖真实 Supabase。
 */
const readSessionMock = vi.fn<(...args: unknown[]) => { uid: string; tgId: number } | null>(() => null);
vi.mock("@/lib/tg/session", () => ({
  TG_COOKIE: "zj_tg",
  readSession: (...a: unknown[]) => readSessionMock(...a),
}));

const getUserMock = vi.fn<(...args: unknown[]) => Promise<{ data: { user: { id: string } | null } }>>(
  async () => ({ data: { user: null } }),
);
vi.mock("@/lib/tg/admin", () => ({
  supabaseAdmin: () => ({ auth: { getUser: (...a: unknown[]) => getUserMock(...a) } }),
}));

const getEntitlementMock = vi.fn<(...args: unknown[]) => Promise<{ tier: string; memberUntil: string | null }>>(
  async () => ({ tier: "free", memberUntil: null }),
);
const isMemberMock = vi.fn<(...args: unknown[]) => boolean>(() => false);
vi.mock("@/lib/entitlements", () => ({
  getEntitlement: (...a: unknown[]) => getEntitlementMock(...a),
  isMember: (...a: unknown[]) => isMemberMock(...a),
}));

const { POST, GET } = await import("../route");

const birth = BirthInputSchema.parse({ date: "1990-06-15", time: "14:30", gender: "male", trueSolarTime: false });

const VALID_READING = {
  markdown: "## 形势\n甲\n\n## 境与你\n乙\n\n## 可做的事\n- 丙\n",
  sections: { situation: "甲", youAndSpace: "乙", actions: "- 丙" },
  corrections: [],
  degraded: false,
};

function req(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/fengshui/reading", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** GET 请求构造（会员闸门探测，Task 10）：不带 body，只带 headers（cookie/Authorization）。 */
function getReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/fengshui/reading", { method: "GET", headers });
}

beforeEach(() => {
  isLlmConfiguredMock.mockReset().mockReturnValue(true);
  generateFengshuiReadingMock.mockReset();
  readSessionMock.mockReset().mockReturnValue(null);
  getUserMock.mockReset().mockResolvedValue({ data: { user: null } });
  getEntitlementMock.mockReset().mockResolvedValue({ tier: "free", memberUntil: null });
  isMemberMock.mockReset().mockReturnValue(false);
  delete process.env.BILLING_ENABLED;
});

afterEach(() => {
  delete process.env.BILLING_ENABLED;
});

describe("POST /api/fengshui/reading", () => {
  it("LLM 未配置时返回 503，不调用 generateFengshuiReading", async () => {
    isLlmConfiguredMock.mockReturnValue(false);
    const res = await POST(req(birth));
    expect(res.status).toBe(503);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
  });

  it("入参非法时返回 400", async () => {
    const res = await POST(req({ date: "not-a-date" }));
    expect(res.status).toBe(400);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
  });

  it("正常路径：返回 JSON，body 含 sections 与 degraded", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    const res = await POST(req(birth));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    const data = await res.json();
    expect(data.sections).toEqual(VALID_READING.sections);
    expect(data.degraded).toBe(false);
  });

  it("degraded 为 true 时 JSON body 如实反映（不再靠响应头传递）", async () => {
    generateFengshuiReadingMock.mockResolvedValue({
      ...VALID_READING,
      corrections: [{ direction: "E", claimed: "五鬼", actual: "生气" }],
      degraded: true,
    });
    const res = await POST(req(birth));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.degraded).toBe(true);
    // 自定义响应头 X-Fengshui-Degraded 已删除——降级信号只应存在于 JSON body 里，
    // 不再有「host 头 + body 两处字面量、改一处就断链」的问题。
    expect(res.headers.has("X-Fengshui-Degraded")).toBe(false);
  });

  it("generateFengshuiReading 抛错时返回 500", async () => {
    generateFengshuiReadingMock.mockRejectedValue(new Error("上游超时"));
    const res = await POST(req(birth));
    expect(res.status).toBe(500);
  });

  it("请求体里的 nickname / x-zj-locale 头会被透传给 generateFengshuiReading", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    await POST(req({ ...birth, nickname: "小明" }, { "x-zj-locale": "en" }));
    expect(generateFengshuiReadingMock).toHaveBeenCalledTimes(1);
    const [, opts] = generateFengshuiReadingMock.mock.calls[0]!;
    expect(opts).toMatchObject({ language: "en", nickname: "小明" });
  });
});

/**
 * Task 9（EP-fs-15）：请求体可选带 dwelling/cohabitants，服务端据此重新
 * computeFengshui（真实实现，未 mock）算出 Layer 1 盘，再交给 generateFengshuiReading
 * （仍 mock，避免真实网络调用）。这里断言的是"接线正确"——服务端确实把居所与合看
 * 成员用于计算，而不是收下就丢；不是重新验证 computeFengshui/dwellingGua 本身的
 * 领域逻辑（那些已由 fengshui-dwelling.test.ts / fengshui-compute.test.ts 覆盖）。
 */
describe("POST /api/fengshui/reading — Layer 1 居所与合看（Task 9/EP-fs-15）", () => {
  it("请求体带 dwelling 与 cohabitants 时，服务端重新计算出 Layer 1 FengshuiChart 并传给 generateFengshuiReading", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    // 1984-06-15 男 = 兑7（西四命），与主档案 1990-06-15 男 = 坎1（东四命）刻意异组，
    // 用来确认 cohabitants 是"各自独立算出命卦"而不是错误地复用了主档案的命卦。
    const cohabBirth = BirthInputSchema.parse({ date: "1984-06-15", time: "10:00", gender: "male", trueSolarTime: false });

    await POST(req({
      ...birth,
      dwelling: { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "S" },
      cohabitants: [{ profileId: "p2", name: "阿乙", birth: cohabBirth }],
    }));

    expect(generateFengshuiReadingMock).toHaveBeenCalledTimes(1);
    const fsArg = generateFengshuiReadingMock.mock.calls[0]![0] as FengshuiChart;
    expect(fsArg.layer).toBe(1);
    if (fsArg.layer !== 1) throw new Error("unreachable");
    // 向南 → 坐北 → 坎宅
    expect(fsArg.dwelling).toMatchObject({ guaName: "坎", facing: "S" });
    expect(fsArg.cohabitants).toHaveLength(1);
    expect(fsArg.cohabitants[0]).toMatchObject({ profileId: "p2", name: "阿乙" });
    expect(fsArg.cohabitants[0]!.mingGua.guaName).toBe("兑");
  });

  it("不带 dwelling/cohabitants 时仍是 Layer 0（向后兼容波1 的调用方式：body 就是 BirthInput 本身）", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    await POST(req(birth));
    const fsArg = generateFengshuiReadingMock.mock.calls[0]![0] as FengshuiChart;
    expect(fsArg.layer).toBe(0);
    expect(fsArg.dwelling).toBeUndefined();
    expect(fsArg.cohabitants).toBeUndefined();
  });

  it("dwelling.facing 非法枚举值时返回 400（不会把半成品塞给 computeFengshui）", async () => {
    const res = await POST(req({ ...birth, dwelling: { id: "d1", name: "家", kind: "home", tenancy: "rent", facing: "NNE" } }));
    expect(res.status).toBe(400);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
  });
});

/**
 * 复审 Minor：cohabitants 数组此前无长度上限。每个同住人服务端都要用
 * computeUnifiedChart 现算一次完整命盘（紫微+八字+西盘）——公开端点上不设上限，
 * N 个同住人就是 N 次重排盘，是一个廉价的放大攻击面。
 */
describe("POST /api/fengshui/reading — cohabitants 上限（复审 Minor）", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ profileId: `p${i}`, name: `人${i}`, birth }));

  it("cohabitants 恰好 8 人时仍正常处理（边界未被误伤）", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    const res = await POST(req({ ...birth, cohabitants: many(8) }));
    expect(res.status).toBe(200);
    expect(generateFengshuiReadingMock).toHaveBeenCalledTimes(1);
  });

  it("cohabitants 超过 8 人时返回 400，不触发任何重排盘或 LLM 调用", async () => {
    const res = await POST(req({ ...birth, cohabitants: many(9) }));
    expect(res.status).toBe(400);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
  });
});

/**
 * 会员闸门（Task 10，EP-fs-17）。spec §11 边界：住宅实盘（dwelling）+ 多住客合看
 * （cohabitants）是会员功能；Layer 0（不带这两个字段）永远免费。全程受 BILLING_ENABLED
 * 门控——该 flag 在 pre-prod 默认关，关时不做任何限制。
 *
 * 客户端闸门可以被绕过（直接打接口，不经过 /fengshui 页面 UI），服务端必须独立判断——
 * 这正是本组测试要覆盖的：不是测「页面上挡住了没有」，而是测「即使客户端完全不设防，
 * 服务端自己会不会挡」。
 *
 * 每条会做限制判断的测试都配一条镜像的对照（会员/未开闸时不受限），避免「测试环境本来
 * 就没开闸、随便怎么判都通过」这种自证陷阱。
 */
describe("POST /api/fengshui/reading — 会员闸门（Task 10，EP-fs-17）", () => {
  const dwellingBody = { id: "d1", name: "家", kind: "home" as const, tenancy: "rent" as const, facing: "S" as const };

  it("BILLING_ENABLED 未开启（pre-prod 默认态）：非会员带 dwelling 的请求仍正常处理——不做任何限制", async () => {
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    readSessionMock.mockReturnValue({ uid: "u1", tgId: 1 });
    getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
    isMemberMock.mockReturnValue(false);

    const res = await POST(req({ ...birth, dwelling: dwellingBody }, { cookie: "zj_tg=t1" }));

    expect(res.status).toBe(200);
    expect(generateFengshuiReadingMock).toHaveBeenCalledTimes(1);
  });

  it("BILLING_ENABLED=1 且非会员：带 dwelling 的请求返回 402，不调用 generateFengshuiReading（对照组：证明开闸后确实会拦，不是环境本来就没限制）", async () => {
    process.env.BILLING_ENABLED = "1";
    readSessionMock.mockReturnValue({ uid: "u1", tgId: 1 });
    getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
    isMemberMock.mockReturnValue(false);

    const res = await POST(req({ ...birth, dwelling: dwellingBody }, { cookie: "zj_tg=t1" }));

    expect(res.status).toBe(402);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
    const data = await res.json();
    expect(data.error).toBe("paywall");
  });

  it("BILLING_ENABLED=1 且非会员：只带 cohabitants（不带 dwelling）同样受限——判别条件是「二者任一存在」", async () => {
    process.env.BILLING_ENABLED = "1";
    readSessionMock.mockReturnValue({ uid: "u1", tgId: 1 });
    getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
    isMemberMock.mockReturnValue(false);

    const res = await POST(
      req({ ...birth, cohabitants: [{ profileId: "p2", name: "阿乙", birth }] }, { cookie: "zj_tg=t1" }),
    );

    expect(res.status).toBe(402);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
  });

  it("BILLING_ENABLED=1 且非会员：不带 dwelling/cohabitants 的 Layer 0 请求不受影响，正常处理（免费层不能被误伤）", async () => {
    process.env.BILLING_ENABLED = "1";
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    readSessionMock.mockReturnValue({ uid: "u1", tgId: 1 });
    getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
    isMemberMock.mockReturnValue(false);

    const res = await POST(req(birth, { cookie: "zj_tg=t1" }));

    expect(res.status).toBe(200);
    expect(generateFengshuiReadingMock).toHaveBeenCalledTimes(1);
  });

  /**
   * 修复单 Important 3：上面那条免费层用例**完全没有 `cohabitants` 这个 key**，
   * 而线上客户端（page.tsx 的叙述 POST）对非会员总是显式发 `cohabitants: []`——
   * 全套路由测试里没有任何一条发过空数组。后果：把 `wantsLayer1` 从
   * `!!dwelling || !!(cohabitants && cohabitants.length > 0)` 简化成
   * `!!dwelling || !!cohabitants`，22 条路由测试照样全绿（`!![]` 是 true，但没人
   * 发空数组），而生产环境里**每一个非会员的免费 Layer 0 请求都会 402**——正是
   * 「免费层不能被误伤」这条硬要求所防的事故。
   * 这条测试用的就是线上客户端真实会发出的 body 形状。
   */
  it("BILLING_ENABLED=1 且非会员：带 `cohabitants: []` 空数组（线上客户端每次都这么发）的 Layer 0 请求同样不受影响", async () => {
    process.env.BILLING_ENABLED = "1";
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    readSessionMock.mockReturnValue({ uid: "u1", tgId: 1 });
    getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
    isMemberMock.mockReturnValue(false);

    // `dwelling: undefined` 会被 JSON.stringify 丢掉，所以真实 body 就是
    // `{...birth, cohabitants: []}`——与 page.tsx 里那段 fetch 逐字对应。
    const res = await POST(req({ ...birth, dwelling: undefined, cohabitants: [] }, { cookie: "zj_tg=t1" }));

    expect(res.status).toBe(200);
    expect(generateFengshuiReadingMock).toHaveBeenCalledTimes(1);
    // 而且确实按 Layer 0 处理——空数组不能被当成"有同住人"
    const fsArg = generateFengshuiReadingMock.mock.calls[0]![0] as FengshuiChart;
    expect(fsArg.layer).toBe(0);
  });

  it("BILLING_ENABLED=1 且是会员：带 dwelling 的请求正常处理（不会被过度拦截）", async () => {
    process.env.BILLING_ENABLED = "1";
    generateFengshuiReadingMock.mockResolvedValue(VALID_READING);
    readSessionMock.mockReturnValue({ uid: "u1", tgId: 1 });
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2999-01-01" });
    isMemberMock.mockReturnValue(true);

    const res = await POST(req({ ...birth, dwelling: dwellingBody }, { cookie: "zj_tg=t1" }));

    expect(res.status).toBe(200);
    expect(generateFengshuiReadingMock).toHaveBeenCalledTimes(1);
  });

  it("BILLING_ENABLED=1 且请求方身份无法识别（无 TG cookie、无 Authorization）：视同非会员，返回 402", async () => {
    process.env.BILLING_ENABLED = "1";

    const res = await POST(req({ ...birth, dwelling: dwellingBody }));

    expect(res.status).toBe(402);
    expect(generateFengshuiReadingMock).not.toHaveBeenCalled();
    // 身份都没解析出来，不该走到会员状态查询这一步
    expect(getEntitlementMock).not.toHaveBeenCalled();
  });

  it("BILLING_ENABLED=1 且非会员：Authorization Bearer 兜底也能正确识别身份并按会员状态判断（非 TG 场景）", async () => {
    process.env.BILLING_ENABLED = "1";
    readSessionMock.mockReturnValue(null); // 没有 TG 会话
    getUserMock.mockResolvedValue({ data: { user: { id: "web-u1" } } });
    getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
    isMemberMock.mockReturnValue(false);

    const res = await POST(req({ ...birth, dwelling: dwellingBody }, { authorization: "Bearer tok123" }));

    expect(res.status).toBe(402);
    expect(getUserMock).toHaveBeenCalledWith("tok123");
    expect(getEntitlementMock).toHaveBeenCalledWith("web-u1");
  });
});

/**
 * GET /api/fengshui/reading —— 会员闸门探测（Task 10，EP-fs-17）。/fengshui 与
 * /fengshui/dwellings 客户端用它决定要不要把宅八方/合看/新增居所渲染成 Paywall。
 * 与上面 POST 的闸门判断共用同一份实现（isFengshuiEntitled）——这里独立测 GET
 * 自己的响应契约，不重复验证闸门规则本身（已在上面 POST 分组覆盖）。
 */
describe("GET /api/fengshui/reading — 会员闸门探测（Task 10，EP-fs-17）", () => {
  it("BILLING_ENABLED 未开启：entitled 恒为 true", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect((await res.json()).entitled).toBe(true);
  });

  it("BILLING_ENABLED=1 且非会员：entitled 为 false", async () => {
    process.env.BILLING_ENABLED = "1";
    readSessionMock.mockReturnValue({ uid: "u1", tgId: 1 });
    getEntitlementMock.mockResolvedValue({ tier: "free", memberUntil: null });
    isMemberMock.mockReturnValue(false);

    const res = await GET(getReq({ cookie: "zj_tg=t1" }));

    expect((await res.json()).entitled).toBe(false);
  });

  it("BILLING_ENABLED=1 且是会员：entitled 为 true", async () => {
    process.env.BILLING_ENABLED = "1";
    readSessionMock.mockReturnValue({ uid: "u1", tgId: 1 });
    getEntitlementMock.mockResolvedValue({ tier: "member", memberUntil: "2999-01-01" });
    isMemberMock.mockReturnValue(true);

    const res = await GET(getReq({ cookie: "zj_tg=t1" }));

    expect((await res.json()).entitled).toBe(true);
  });

  it("BILLING_ENABLED=1 且未登录：entitled 为 false", async () => {
    process.env.BILLING_ENABLED = "1";

    const res = await GET(getReq());

    expect((await res.json()).entitled).toBe(false);
  });
});
