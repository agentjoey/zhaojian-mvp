import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import { streamReading, resolveLlmConfig, isLlmConfigured } from "@eamvp/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/reading —— 计算命盘 → 流式输出双声部解读（text/plain，逐块）。
 * 排盘确定性、密钥服务端；LLM 未配置时返回 503 而非静默。
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

  let chart;
  try {
    chart = computeUnifiedChart(parsed.data);
  } catch (e) {
    return new Response(`排盘失败：${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamReading(chart, { nickname: parsed.data.nickname, language: "zh" })) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n⚠️ ${e instanceof Error ? e.message : String(e)}`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Model": cfg.model },
  });
}
