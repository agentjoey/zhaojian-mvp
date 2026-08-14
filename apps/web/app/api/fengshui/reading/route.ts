import { computeUnifiedChart, computeFengshui, BirthInputSchema } from "@eamvp/core";
import { generateFengshuiReading, resolveLlmConfig, isLlmConfigured } from "@eamvp/llm";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/fengshui/reading —— 确定性排盘 + 风水派生 → 三分节报告 markdown。
 * 一次性返回（非流式）：报告较短且客户端会缓存。
 * LLM 未配置返回 503；客户端据此降级为纯确定性呈现，不留白页。
 *
 * 响应头 `X-Fengshui-Degraded: "1"|"0"` 携带 generateFengshuiReading 返回值里的
 * `degraded` 信号（模型对确定性事实说错话、已被机械纠正——纠正救得回星名，
 * 救不回建立在错方位上的整段叙述，见 @eamvp/llm 的 FengshuiReading.degraded 文档）。
 * body 仍是纯 markdown 文本，不额外包一层 JSON——这样客户端可以继续把
 * `await r.text()` 直接当作可渲染/可缓存的叙述来用，只多读一个头部判断是否可信。
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
    return new Response(r.markdown, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "X-Fengshui-Degraded": r.degraded ? "1" : "0",
      },
    });
  } catch (e) {
    return new Response(`风水报告生成失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
