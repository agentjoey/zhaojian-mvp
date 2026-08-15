import { computeUnifiedChart, computeFengshui, BirthInputSchema } from "@eamvp/core";
import { generateFengshuiReading, resolveLlmConfig, isLlmConfigured } from "@eamvp/llm";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) {
    return new Response("LLM 未配置：请在环境变量设置 LLM_API_KEY（默认 provider=minimax, model=MiniMax-M3）。", {
      status: 503,
    });
  }

  const parsed = BirthInputSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
  }

  try {
    const chart = computeUnifiedChart(parsed.data);
    const fs = computeFengshui({ birth: parsed.data, chart });
    const r = await generateFengshuiReading(fs, {
      language: localeFromRequest(req),
      nickname: parsed.data.nickname,
    });
    return Response.json({ sections: r.sections, degraded: r.degraded });
  } catch (e) {
    return new Response(`风水报告生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
