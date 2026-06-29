import { cookies } from "next/headers";
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser, createProfileForUser } from "@/lib/tg/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function uid(): Promise<{ uid: string } | null> {
  const c = (await cookies()).get(TG_COOKIE)?.value;
  return readSession(c);
}

export async function GET(): Promise<Response> {
  const s = await uid(); if (!s) return new Response("未登录", { status: 401 });
  const p = await getProfileForUser(s.uid);
  return Response.json({ profile: p });
}

export async function POST(req: Request): Promise<Response> {
  const s = await uid(); if (!s) return new Response("未登录", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = BirthInputSchema.safeParse(body?.birthInput);
  if (!parsed.success) return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
  let chart; try { chart = computeUnifiedChart(parsed.data); } catch (e) { return new Response("排盘失败", { status: 500 }); }
  const profile = await createProfileForUser(s.uid, { nickname: body?.nickname, birthInput: parsed.data, chart });
  return Response.json({ profile });
}
