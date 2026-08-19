import { resolveLlmConfig, isLlmConfigured, generateSpiritIntro, streamSpiritChat } from "@eamvp/llm";
import type { UnifiedChart } from "@eamvp/core";
import { supabaseAdmin } from "@/lib/tg/admin";
import { consumeLlm } from "@/lib/entitlements";
import { resolveAccess } from "@/lib/access";
import { localeFromRequest } from "@/lib/i18n/server";

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
  const questionnaire = typeof body?.questionnaire === "string" ? body.questionnaire : undefined;
  if (!chart) {
    return new Response("缺少命盘 chart", { status: 400 });
  }

  const authHeader = req.headers.get("authorization");
  let userId: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data } = await supabaseAdmin().auth.getUser(token);
    userId = data.user?.id;
  }

  // 开场白（messages 为空）不消耗额度，也不要求已识别身份——这个分支本来就
  // 不发起真正的对话。有消息时，必须解析出「已识别」身份才放行
  // （EP-account2-05）：此前是 `if (!isIntro && userId)`，userId 为
  // undefined（未带 token）时闸门被整个跳过，等于无限免费；现在改成
  // 「解析不出已识别身份就拒绝」，fail-safe 而不是 fail-open。
  // 判定必须与下方的消费分支对齐（messages.length === 0）：若用
  // 「无 user 角色消息」判免闸，伪造的 [{role:"spirit",...}] 历史会绕过
  // 身份与额度检查，白走 streamSpiritChat 烧 LLM。
  const isIntro = messages.length === 0;
  if (!isIntro) {
    if (!userId) {
      return new Response("未登录", { status: 401 });
    }
    const access = await resolveAccess(userId);
    if (access.level === "anonymous") {
      return new Response("未登录", { status: 401 });
    }
    const gate = await consumeLlm(userId);
    if (!gate.ok) {
      return new Response(JSON.stringify({ error: "paywall" }), { status: 402, headers: { "content-type": "application/json" } });
    }
  }

  const language = localeFromRequest(req);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (messages.length === 0) {
          const { text } = await generateSpiritIntro(chart, { language, memory, questionnaire });
          controller.enqueue(encoder.encode(text));
        } else {
          for await (const chunk of streamSpiritChat(chart, messages, { language, memory, questionnaire })) {
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
