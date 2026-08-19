import { cookies } from "next/headers";
import { formatQuestionnaire } from "@eamvp/core";
import { resolveLlmConfig, isLlmConfigured, interpretDream, summarizeSpiritMemory, DREAM_MAX_CHARS } from "@eamvp/llm";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser } from "@/lib/tg/identity";
import { getMemory, getQuestionnaire, saveMemory } from "@/lib/tg/data";
import { consumeQuota } from "@/lib/tg/quota";
import { consumeLlm } from "@/lib/entitlements";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tg/dream —— TG 会话解梦。
 * ⚠️ 只参照 api/tg/spirit 的鉴权，不参照其持久化：
 * 严禁 appendMessage / 严禁写 spirit_messages / 不提供 GET 历史（spec §4 明写排除项——
 * 梦原文不落库）。记忆提炼是例外——照 api/tg/spirit 同款 fire-and-forget（不阻塞响应，
 * 失败静默吞掉），只存 summarizeSpiritMemory 提炼出的摘要，梦原文本身仍不落库。
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
  const dream = typeof body?.dream === "string" ? body.dream.trim() : "";
  if (!dream) return new Response("缺少梦境 dream", { status: 400 });
  if (dream.length > DREAM_MAX_CHARS) return new Response("梦境过长", { status: 400 });

  if (!(await consumeQuota(s.tgId))) return Response.json({ error: "quota" }, { status: 402 });
  const gate = await consumeLlm(s.uid);
  if (!gate.ok) return Response.json({ error: "paywall" }, { status: 402 });

  const mem = await getMemory(profile.id);
  const qa = await getQuestionnaire(profile.id);
  const language = localeFromRequest(req);

  try {
    let out = "";
    for await (const chunk of interpretDream(profile.chart, dream, {
      language,
      memory: mem ?? undefined,
      questionnaire: qa ? formatQuestionnaire(qa) : undefined,
    })) out += chunk;

    // fire-and-forget：记忆提炼（spec §4「记忆」行）。只存摘要，梦原文不进 spirit_memory。
    (async () => {
      try {
        const summary = await summarizeSpiritMemory(
          [
            { role: "user", content: dream },
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

    return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(`⚠️ ${e instanceof Error ? e.message : String(e)}`, { status: 500 });
  }
}
