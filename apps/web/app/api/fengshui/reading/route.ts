import { z } from "zod";
import { computeUnifiedChart, computeFengshui, BirthInputSchema } from "@eamvp/core";
import { generateFengshuiReading, resolveLlmConfig, isLlmConfigured } from "@eamvp/llm";
import { localeFromRequest } from "@/lib/i18n/server";

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

/**
 * 同住人数组上限（复审 Minor）：每个同住人服务端都要用 computeUnifiedChart 现算一次
 * 完整命盘（紫微+八字+西盘）——公开端点若不设上限，N 个同住人就是 N 次重排盘，
 * 是一个廉价的放大攻击面。8 是留了充分余量的保守上限（正常使用场景里「同住人」
 * 数量远小于此）。
 */
const MAX_COHABITANTS = 8;

const ReadingRequestSchema = BirthInputSchema.extend({
  dwelling: DwellingBodySchema.optional(),
  cohabitants: z.array(CohabitantBodySchema).max(MAX_COHABITANTS).optional(),
});

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

  try {
    const { dwelling, cohabitants, ...birth } = parsed.data;
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
