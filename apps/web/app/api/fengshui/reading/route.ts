import { z } from "zod";
import { computeUnifiedChart, computeFengshui, BirthInputSchema } from "@eamvp/core";
import { generateFengshuiReading, resolveLlmConfig, isLlmConfigured } from "@eamvp/llm";
import { localeFromRequest } from "@/lib/i18n/server";
import { getEntitlement, isMember } from "@/lib/entitlements";
// 同住人上限的**单一事实源**（最终评审 I1）。此前这个常量只存在于本文件里，
// 客户端选择器不设限 → 用户勾满 9 个存下来，之后每次加载 /fengshui 都被下面这条
// `.max()` 打成 400，且无法自解。上限现在与 DwellingForm 的选择器同源。
import { MAX_COHABITANTS } from "@/lib/fengshui-limits";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { supabaseAdmin } from "@/lib/tg/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 居所/合看成员校验（Task 9，EP-fs-15）。用 `.extend()` 而不是套一层
 * `{ birth, dwelling, cohabitants }`——请求体本体仍然就是 `BirthInput`，
 * `dwelling`/`cohabitants` 是两个新增的可选字段。这样波1 已有的调用方式
 * （body 就是 BirthInput 本身）在两个新字段缺省时保持逐字节兼容，
 * route.test.ts 里波1 就有的 Layer 0 路径测试不必跟着改。
 *
 * 方位枚举直接字面量列出（而非从 core 的 `DIRECTIONS` 常量派生）：`DIRECTIONS`
 * 是 `as const` 的只读元组，`z.enum` 的类型签名要求可写元组，两者对不上时容易
 * 引出与本路由无关的类型体操；核心真值仍是 core 的 `DIRECTIONS`，这里只是照抄
 * 其字面量集合做输入校验，不是重新定义方位。
 */
const DirectionSchema = z.enum(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

const DwellingBodySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["home", "office"]),
  tenancy: z.enum(["rent", "own"]),
  facing: DirectionSchema,
});

const CohabitantBodySchema = z.object({
  profileId: z.string(),
  name: z.string(),
  birth: BirthInputSchema,
});

const ReadingRequestSchema = BirthInputSchema.extend({
  dwelling: DwellingBodySchema.optional(),
  cohabitants: z.array(CohabitantBodySchema).max(MAX_COHABITANTS).optional(),
});

/**
 * 从请求里解析 uid（Task 10，EP-fs-17 会员闸门）。手法与 billing/status/route.ts
 * 完全一致：TG 会话 cookie（zj_tg）优先，Authorization Bearer 兜底（邮箱登录等非
 * TG 场景）。
 *
 * ⚠️ 特意不用 `@/lib/account/uid.ts` 的 `resolveUid()`：那个实现依赖 `next/headers`
 * 的 `cookies()`，读取的是 Next 请求处理内部维护的 AsyncLocalStorage 上下文，只有
 * 真正经由 Next 的路由分发时才会被填充。本路由的测试直接 `import { POST, GET }`
 * 后拿一个手搓的 `Request` 调用（不经过 Next 的开发/构建服务器，见 route.test.ts
 * 顶部注释），没有那层上下文，`cookies()` 在这种调用方式下不可靠。改成直接读
 * `req.headers.get("cookie")`——只依赖 Request 对象本身，两种调用方式下行为一致。
 */
async function resolveUserId(req: Request): Promise<string | undefined> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const tgToken = cookieHeader
    .split("; ")
    .find((c) => c.startsWith(`${TG_COOKIE}=`))
    ?.slice(TG_COOKIE.length + 1);
  const tgSession = readSession(tgToken);
  if (tgSession) return tgSession.uid;

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data } = await supabaseAdmin().auth.getUser(token);
    return data.user?.id;
  }
  return undefined;
}

/**
 * 会员闸门（Task 10，EP-fs-17）。spec §11 边界：Layer 0（本命方位、物件顾问弱版）
 * 永远免费；住宅实盘（dwelling）+ 分级化解、多住客合看（cohabitants）、多套居所是
 * 会员功能。`BILLING_ENABLED` 关闭时（pre-prod 默认态）永远放行——与
 * `lib/entitlements.ts` 的 `consumeLlm()` 同一手法（`if (BILLING_ENABLED !== "1")
 * return 放行`），避免闸门判断在两处各写一份、其中一处忘了同步。未能解析出 uid
 * （未登录/身份不明）与非会员同等对待：都视为不满足。
 *
 * GET（闸门探测）与 POST（叙述生成的服务端校验）共用这一份实现，不重复。
 */
async function isFengshuiEntitled(req: Request): Promise<boolean> {
  if (process.env.BILLING_ENABLED !== "1") return true;
  const uid = await resolveUserId(req);
  if (!uid) return false;
  return isMember(await getEntitlement(uid));
}

/**
 * GET /api/fengshui/reading —— 会员闸门探测（Task 10，EP-fs-17）。`/fengshui` 与
 * `/fengshui/dwellings` 客户端用它决定要不要把宅八方/合看/新增第二个居所渲染成
 * Paywall——这个判断依赖 `BILLING_ENABLED`（无 `NEXT_PUBLIC_` 前缀）与会员状态
 * （查询需要 service-role key），两者都是服务端专属信息，客户端读不到，只能问
 * 服务端。与下面 POST 的服务端校验共用 `isFengshuiEntitled`，避免同一条闸门规则
 * 写两份、日后改一处漏改另一处。
 */
export async function GET(req: Request): Promise<Response> {
  return Response.json({ entitled: await isFengshuiEntitled(req) });
}

/**
 * POST /api/fengshui/reading —— 确定性排盘 + 风水派生 → 三分节报告。
 * 一次性返回（非流式）：报告较短且客户端会缓存。
 * LLM 未配置返回 503；客户端据此降级为纯确定性呈现，不留白页。
 *
 * 响应契约（Task 14 复审必修1，取代此前的「纯 markdown 文本 + X-Fengshui-Degraded
 * 响应头」）：body 是 JSON，`{ sections: { situation, youAndSpace, actions }, degraded }`。
 * `sections` 就是 generateFengshuiReading 已经按三个 H2 切好的分节正文（不含标题行本身，
 * 标题由客户端按 i18n 渲染）；`degraded` 是 generateFengshuiReading 的降级信号（模型对
 * 确定性事实说错话、已被机械纠正——纠正救得回星名，救不回建立在错方位上的整段叙述，
 * 见 @eamvp/llm 的 FengshuiReading.degraded 文档）。改用 JSON body 而不是自定义响应头，
 * 是因为降级信号只应该有一处字面量：塞进响应头意味着「设置」「转发」「客户端读取」三处
 * 各写一遍 `"X-Fengshui-Degraded"`/`"1"`/`"0"` 字符串，改一处很容易漏改另一处、悄悄断链；
 * 并入 JSON body 后就是普通的类型化字段，没有这个问题。
 * `markdown` 字段不返回——客户端分节渲染，不再需要完整拼接的 markdown 文本。
 *
 * Task 9（EP-fs-15）：请求体可选带 `dwelling`/`cohabitants`。同住人只传各自的
 * `birth`（不传 `chart`）——服务端用 `computeUnifiedChart` 现算，与主档案一致，
 * 避免信任客户端传来的、可能与当前引擎版本不一致的冻结命盘 JSON。
 *
 * Task 10（EP-fs-15 → EP-fs-17 会员闸门）：`dwelling`/`cohabitants` 是会员功能
 * （住宅实盘 + 多住客合看），服务端独立校验——客户端闸门（/fengshui 页面上的
 * Paywall）只挡得住走页面 UI 的请求，直接打这个接口能绕过去，所以这里必须自己
 * 再判一次，不能只信任客户端不发这两个字段。未通过时返回 402（与
 * `/api/spirit/chat` 的 LLM 额度闸门同一个状态码语义），不触碰
 * `computeFengshui`/`generateFengshuiReading`，不产生任何 LLM 费用。
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) {
    return new Response("LLM 未配置：请在环境变量设置 LLM_API_KEY（默认 provider=minimax, model=MiniMax-M3）。", {
      status: 503,
    });
  }

  const parsed = ReadingRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
  }

  const { dwelling, cohabitants, ...birth } = parsed.data;

  const wantsLayer1 = !!dwelling || !!(cohabitants && cohabitants.length > 0);
  if (wantsLayer1 && !(await isFengshuiEntitled(req))) {
    return new Response(JSON.stringify({ error: "paywall" }), {
      status: 402,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const chart = computeUnifiedChart(birth);
    const fs = computeFengshui({
      birth,
      chart,
      dwelling,
      cohabitants: cohabitants?.map((c) => ({
        profileId: c.profileId, name: c.name, birth: c.birth, chart: computeUnifiedChart(c.birth),
      })),
    });
    const r = await generateFengshuiReading(fs, {
      language: localeFromRequest(req),
      nickname: birth.nickname,
    });
    return Response.json({ sections: r.sections, degraded: r.degraded });
  } catch (e) {
    return new Response(`风水报告生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
