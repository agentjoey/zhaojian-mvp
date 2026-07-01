import { cookies } from "next/headers";
import { computeDailyFortune, formatQuestionnaire } from "@eamvp/core";
import { generateDailySpiritGreeting } from "@eamvp/llm";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser } from "@/lib/tg/identity";
import { getMemory, getQuestionnaire } from "@/lib/tg/data";
import { consumeQuota } from "@/lib/tg/quota";
import { consumeLlm } from "@/lib/entitlements";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sess() {
  const c = (await cookies()).get(TG_COOKIE)?.value;
  return readSession(c);
}

export async function POST(req: Request): Promise<Response> {
  const s = await sess();
  if (!s) return new Response("未登录", { status: 401 });
  const profile = await getProfileForUser(s.uid);
  if (!profile) return new Response("无档案", { status: 400 });

  const body = await req.json().catch(() => ({}));
  const dateStr = typeof body?.dateStr === "string" ? body.dateStr : "";
  if (!dateStr) return new Response("缺少 dateStr", { status: 400 });

  const daily = computeDailyFortune(profile.chart, dateStr);
  let greeting: string | null = null;
  const language = localeFromRequest(req);

  if (await consumeQuota(s.tgId)) {
    const mem = await getMemory(profile.id);
    const qa = await getQuestionnaire(profile.id);
    const q = qa ? formatQuestionnaire(qa) : undefined;
    // 仅对 LLM 生成的 behavior/greeting 计费；前面的 五维/黄历（computeDailyFortune）不消耗额度，缓存命中也不消耗。
    const gate = await consumeLlm(s.uid);
    if (!gate.ok) {
      return Response.json({ error: "paywall" }, { status: 402 });
    }
    greeting = (
      await generateDailySpiritGreeting(profile.chart, daily, dateStr, {
        language,
        memory: mem ?? undefined,
        questionnaire: q,
      })
    ).text;
  }

  return Response.json({ daily, greeting });
}
