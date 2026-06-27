import { resolveLlmConfig, isLlmConfigured, generateSpiritIntro, streamSpiritChat } from "@eamvp/llm";
import type { UnifiedChart } from "@eamvp/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/spirit/chat —— 无状态：客户端把已冻结命盘随 body 传来。
 * messages 为空 → 灵的开场白（一次性）；否则流式多轮对话（text/plain，逐块）。
 * 密钥服务端；LLM 未配置时返回 503 而非静默。
 */
export async function POST(req: Request): Promise<Response> {
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) {
    return new Response("LLM 未配置：请在环境变量设置 LLM_API_KEY（默认 provider=minimax, model=MiniMax-M3）。", {
      status: 503,
    });
  }

  const body = await req.json().catch(() => ({}));
  const chart = body?.chart as UnifiedChart | undefined;
  const messages: { role: "user" | "spirit"; content: string }[] = Array.isArray(body?.messages) ? body.messages : [];
  const memory = typeof body?.memory === "string" ? body.memory : undefined;
  if (!chart) {
    return new Response("缺少命盘 chart", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (messages.length === 0) {
          const { text } = await generateSpiritIntro(chart, { language: "en", memory });
          controller.enqueue(encoder.encode(text));
        } else {
          for await (const chunk of streamSpiritChat(chart, messages, { language: "en", memory })) {
            controller.enqueue(encoder.encode(chunk));
          }
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
