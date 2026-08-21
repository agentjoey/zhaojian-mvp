import { cookies } from "next/headers";
import { formatQuestionnaire } from "@eamvp/core";
import { resolveLlmConfig, isLlmConfigured, interpretDream, continueDreamReply, summarizeSpiritMemory, summarizeDreamEntry, DREAM_MAX_CHARS, type SpiritTurn } from "@eamvp/llm";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser } from "@/lib/tg/identity";
import { getMemory, getQuestionnaire, saveMemory, appendDreamHistory, listDreamHistory } from "@/lib/tg/data";
import { consumeQuota } from "@/lib/tg/quota";
import { consumeLlm } from "@/lib/entitlements";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tg/dream —— TG 会话解梦。
 * ⚠️ 只参照 api/tg/spirit 的鉴权，不参照其持久化：严禁 appendMessage / 严禁写
 * spirit_messages（梦原文不落库，spec §5.1）。记忆提炼与 EP-dream-history 摘要都是
 * 例外——两者都 fire-and-forget（不阻塞响应，失败静默吞掉），且都只存 LLM 提炼出的
 * 摘要，梦原文本身仍不落库、不进日志。dream_history 只在「首次解读」这次调用写一条
 * （追问 followUp 不重复写——一次解梦会话在列表里只对应一条记录）。
 */
export async function POST(req: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_DREAM_ENABLED !== "1") return new Response("未开启", { status: 404 });
  // 前置 503：LLM 未配置时先挡，避免 interpretDream 抛错被 catch 成 500，
  // 且 consumeQuota/consumeLlm 双额度不被平台错误白扣。
  const cfg = resolveLlmConfig();
  if (!isLlmConfigured(cfg)) return new Response("LLM 未配置", { status: 503 });
  const c = (await cookies()).get(TG_COOKIE)?.value;
  const s = await readSession(c);
  if (!s) return new Response("未登录", { status: 401 });
  const profile = await getProfileForUser(s.uid);
  if (!profile) return new Response("无档案", { status: 400 });

  const body = await req.json().catch(() => ({}));
  // EP-dream-history-2 续接历史：dream 不传（undefined）——priorTurns[0] 就是历史里
  // 存的解读全文，continueDreamReply 据此跳过首轮梦原文重建。
  const dreamRaw = typeof body?.dream === "string" ? body.dream.trim() : undefined;
  const followUp = typeof body?.followUp === "string" ? body.followUp.trim() : "";
  const priorTurns = (Array.isArray(body?.priorTurns) ? body.priorTurns : []).slice(-12) as SpiritTurn[];
  if (!followUp && !dreamRaw) return new Response("缺少梦境 dream", { status: 400 });
  if (dreamRaw && dreamRaw.length > DREAM_MAX_CHARS) return new Response("梦境过长", { status: 400 });
  if (followUp && followUp.length > DREAM_MAX_CHARS) return new Response("追问过长", { status: 400 });

  if (!(await consumeQuota(s.tgId))) return Response.json({ error: "quota" }, { status: 402 });
  const gate = await consumeLlm(s.uid);
  if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });

  const mem = await getMemory(profile.id);
  const qa = await getQuestionnaire(profile.id);
  const language = localeFromRequest(req);

  const opts = { language, memory: mem ?? undefined, questionnaire: qa ? formatQuestionnaire(qa) : undefined };
  try {
    let out: string;
    if (followUp) {
      out = (await continueDreamReply(profile.chart, dreamRaw, priorTurns, followUp, opts)).text;
    } else {
      out = "";
      for await (const chunk of interpretDream(profile.chart, dreamRaw as string, opts)) out += chunk;
    }

    // fire-and-forget：记忆提炼（spec §4「记忆」行）。只存摘要，梦原文不进 spirit_memory。
    // 续接历史场景 dreamRaw 为 undefined——降级用空串，记忆摘要质量打折但不阻断响应。
    (async () => {
      try {
        const summary = await summarizeSpiritMemory(
          [
            { role: "user", content: dreamRaw ?? "" },
            { role: "spirit", content: out },
          ],
          mem ?? undefined,
          { language },
        );
        if (summary) await saveMemory(profile.id, summary);
      } catch {
        // 与 api/tg/spirit 同一策略：记忆更新失败不影响本次解读已成功返回
      }
    })();

    // fire-and-forget：EP-dream-history 列表摘要+解读全文。只在首次解读写一条（追问不重复写）。
    if (!followUp) {
      const dream = dreamRaw as string;
      (async () => {
        try {
          const entrySummary = await summarizeDreamEntry(dream, out, { language });
          if (entrySummary) await appendDreamHistory(profile.id, entrySummary, out);
        } catch {
          // 历史条目丢一条不影响本次解读已成功返回
        }
      })();
    }

    return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(`⚠️ ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}

/** GET /api/tg/dream —— 最近 10 条解梦历史（摘要，非原文，见 POST 头部注释）。 */
export async function GET(): Promise<Response> {
  if (process.env.NEXT_PUBLIC_DREAM_ENABLED !== "1") return new Response("未开启", { status: 404 });
  const c = (await cookies()).get(TG_COOKIE)?.value;
  const s = await readSession(c);
  if (!s) return new Response("未登录", { status: 401 });
  const profile = await getProfileForUser(s.uid);
  if (!profile) return new Response("无档案", { status: 400 });
  const history = await listDreamHistory(profile.id);
  return Response.json({ history });
}
