import { isLlmConfigured, resolveLlmConfig } from "@eamvp/llm";
import { localeFromRequest } from "@/lib/i18n/server";
// 校验 schema / 会员闸门 / 生成逻辑与 TG 中介端点（api/tg/fengshui 的 reading action）
// 共用同一份实现（EP-fs-tg），见 lib/fengshui-reading.ts 顶部注释——闸门规则只写一份。
import {
  ReadingRequestSchema,
  generateFengshuiSections,
  isFengshuiEntitledForUid,
  wantsLayer1,
} from "@/lib/fengshui-reading";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { supabaseAdmin } from "@/lib/tg/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * 会员闸门（Task 10，EP-fs-17）。规则本体在 `isFengshuiEntitledForUid`
 * （lib/fengshui-reading.ts），这里只负责「从请求解出 uid」这一入口特有的一步。
 * GET（闸门探测）与 POST（叙述生成的服务端校验）共用这一份实现，不重复。
 */
async function isFengshuiEntitled(req: Request): Promise<boolean> {
  return isFengshuiEntitledForUid(await resolveUserId(req));
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

  if (wantsLayer1(parsed.data) && !(await isFengshuiEntitled(req))) {
    return new Response(JSON.stringify({ error: "paywall" }), {
      status: 402,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const r = await generateFengshuiSections(parsed.data, localeFromRequest(req));
    return Response.json({ sections: r.sections, degraded: r.degraded });
  } catch (e) {
    return new Response(`风水报告生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
