import { resolveLlmConfig, isLlmConfigured, interpretDream, continueDreamReply, DREAM_MAX_CHARS, type SpiritTurn } from "@eamvp/llm";
import type { UnifiedChart } from "@eamvp/core";
import { supabaseAdmin } from "@/lib/tg/admin";
import { consumeLlm } from "@/lib/entitlements";
import { resolveAccess } from "@/lib/access";
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
  // EP-dream-history 追问：dream 仍是原始梦文本（用来重建首轮 prompt，见 continueDreamReply），
  // followUp 是这一轮的新问题；priorTurns 是浏览器会话内持有的往返记录，不落库、随请求即用即弃。
  const followUp = typeof body?.followUp === "string" ? body.followUp.trim() : "";
  const priorTurns = (Array.isArray(body?.priorTurns) ? body.priorTurns : []).slice(-12) as SpiritTurn[];
  if (!chart) return new Response("缺少命盘 chart", { status: 400 });
  if (!dream) return new Response("缺少梦境 dream", { status: 400 });
  if (dream.length > DREAM_MAX_CHARS) return new Response("梦境过长", { status: 400 });
  if (followUp && followUp.length > DREAM_MAX_CHARS) return new Response("追问过长", { status: 400 });

  const authHeader = req.headers.get("authorization");
  let userId: string | undefined;
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabaseAdmin().auth.getUser(authHeader.slice(7));
    userId = data.user?.id;
  }
  // EP-account2-05：与 api/spirit/chat 同一处漏洞（原 `if (userId)` 未带 token
  // 时静默跳过闸门）。解梦没有开场白分支，任何一次调用都必须已识别身份。
  if (!userId) {
    return new Response("未登录", { status: 401 });
  }
  const access = await resolveAccess(userId);
  if (access.level === "anonymous") {
    return new Response("未登录", { status: 401 });
  }
  const gate = await consumeLlm(userId);
  if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });

  const language = localeFromRequest(req);
  const opts = {
    language,
    memory: typeof body?.memory === "string" ? body.memory : undefined,
    questionnaire: typeof body?.questionnaire === "string" ? body.questionnaire : undefined,
  };
  try {
    let out: string;
    if (followUp) {
      out = (await continueDreamReply(chart, dream, priorTurns, followUp, opts)).text;
    } else {
      out = "";
      for await (const chunk of interpretDream(chart, dream, opts)) out += chunk;
    }
    return new Response(out, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(`⚠️ ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
