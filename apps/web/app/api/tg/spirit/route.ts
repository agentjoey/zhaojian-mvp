import { cookies } from "next/headers";
import { formatQuestionnaire } from "@eamvp/core";
import {
  streamSpiritChat,
  summarizeSpiritMemory,
} from "@eamvp/llm";
import type { SpiritTurn } from "@eamvp/llm";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser } from "@/lib/tg/identity";
import {
  listMessages,
  appendMessage,
  getMemory,
  getQuestionnaire,
  saveMemory,
} from "@/lib/tg/data";
import { consumeQuota } from "@/lib/tg/quota";
import { consumeLlm } from "@/lib/entitlements";
import { localeFromRequest } from "@/lib/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sess() {
  const c = (await cookies()).get(TG_COOKIE)?.value;
  return readSession(c);
}

export async function GET(): Promise<Response> {
  const s = await sess();
  if (!s) return new Response("未登录", { status: 401 });
  const profile = await getProfileForUser(s.uid);
  if (!profile) return Response.json({ messages: [] });
  return Response.json({ messages: await listMessages(profile.id) });
}

export async function POST(req: Request): Promise<Response> {
  const s = await sess();
  if (!s) return new Response("未登录", { status: 401 });
  const profile = await getProfileForUser(s.uid);
  if (!profile) return new Response("无档案", { status: 400 });

  const body = await req.json().catch(() => ({}));
  const turns: SpiritTurn[] = Array.isArray(body?.messages)
    ? body.messages.filter(
        (m: any) =>
          m &&
          typeof m.content === "string" &&
          (m.role === "user" || m.role === "spirit"),
      )
    : [];
  if (turns.length === 0) {
    return new Response("缺少 messages", { status: 400 });
  }

  if (!(await consumeQuota(s.tgId))) {
    return new Response(JSON.stringify({ error: "quota" }), {
      status: 402,
      headers: { "content-type": "application/json" },
    });
  }

  const gate = await consumeLlm(s.uid);
  if (!gate.ok) {
    return Response.json({ error: "paywall" }, { status: 402 });
  }

  const mem = await getMemory(profile.id);
  const qa = await getQuestionnaire(profile.id);
  const q = qa ? formatQuestionnaire(qa) : undefined;
  const language = localeFromRequest(req);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of streamSpiritChat(profile.chart, turns, {
          language,
          memory: mem ?? undefined,
          questionnaire: q,
        })) {
          controller.enqueue(encoder.encode(chunk));
          full += chunk;
        }

        const last = turns[turns.length - 1];
        if (last && last.role === "user") {
          await appendMessage(profile.id, "user", last.content);
        }
        await appendMessage(profile.id, "spirit", full);
      } catch (e) {
        controller.enqueue(
          encoder.encode(`\n\n⚠️ ${e instanceof Error ? e.message : String(e)}`),
        );
      } finally {
        controller.close();
      }

      // fire-and-forget: summarize conversation memory
      (async () => {
        try {
          const summary = await summarizeSpiritMemory(
            [...turns, { role: "spirit", content: full }],
            mem ?? undefined,
            { language },
          );
          if (summary) await saveMemory(profile.id, summary);
        } catch {
          // ignore memory update errors
        }
      })();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
