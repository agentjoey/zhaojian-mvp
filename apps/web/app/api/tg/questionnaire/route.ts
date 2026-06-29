import { cookies } from "next/headers";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser } from "@/lib/tg/identity";
import { getQuestionnaire, saveQuestionnaire } from "@/lib/tg/data";

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
  const answers = profile ? await getQuestionnaire(profile.id) : null;
  return Response.json({ answers });
}

export async function POST(req: Request): Promise<Response> {
  const s = await sess();
  if (!s) return new Response("未登录", { status: 401 });
  const profile = await getProfileForUser(s.uid);
  if (!profile) return new Response("无档案", { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (
    !body ||
    typeof body.answers !== "object" ||
    body.answers === null ||
    Array.isArray(body.answers)
  ) {
    return new Response("缺少 answers", { status: 400 });
  }

  await saveQuestionnaire(profile.id, body.answers as Record<string, string>);
  return Response.json({ ok: true });
}
