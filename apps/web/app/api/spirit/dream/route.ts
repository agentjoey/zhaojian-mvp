import { resolveLlmConfig, isLlmConfigured, interpretDream, DREAM_MAX_CHARS } from "@eamvp/llm";
import type { UnifiedChart } from "@eamvp/core";
import { supabaseAdmin } from "@/lib/tg/admin";
import { consumeLlm } from "@/lib/entitlements";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/spirit/dream —— 无状态解梦：chart 与梦随 body 传来，解读不落库。 */
export async function POST(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_DREAM_ENABLED !== "1") return new Response("未开启", { status: 404 });
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) return new Response("LLM 未配置", { status: 503 });

  const body = await req.json().catch(() => ({}));
  const chart = body?.chart as UnifiedChart | undefined;
  const dream = typeof body?.dream === "string" ? body.dream.trim() : "";
  if (!chart) return new Response("缺少命盘 chart", { status: 400 });
  if (!dream) return new Response("缺少梦境 dream", { status: 400 });
  if (dream.length > DREAM_MAX_CHARS) return new Response("梦境过长", { status: 400 });

  const authHeader = req.headers.get("authorization");
  let userId: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabaseAdmin().auth.getUser(authHeader.slice(7));
    userId = data.user?.id;
  }
  if (userId) {
    const gate = await consumeLlm(userId);
    if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });
  }

  const language = localeFromRequest(req);
  try {
    let out = "";
    for await (const chunk of interpretDream(chart, dream, {
      language,
      memory: typeof body?.memory === "string" ? body.memory : undefined,
      questionnaire: typeof body?.questionnaire === "string" ? body.questionnaire : undefined,
    })) out += chunk;
    return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(`⚠️ ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
