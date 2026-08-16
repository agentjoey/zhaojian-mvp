import { cookies } from "next/headers";
import { computeUnifiedChart, BirthInputSchema } from "@eamvp/core";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser, createProfileForUser, listProfilesForUser, deleteProfileForUser } from "@/lib/tg/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function uid(): Promise<{ uid: string } | null> {
  const c = (await cookies()).get(TG_COOKIE)?.value;
  return readSession(c);
}

export async function GET(): Promise<Response> {
  const s = await uid(); if (!s) return new Response("未登录", { status: 401 });
  const p = await getProfileForUser(s.uid);
  return Response.json({ profile: p, profiles: await listProfilesForUser(s.uid) });
}

export async function DELETE(req: Request): Promise<Response> {
  const s = await uid(); if (!s) return new Response("未登录", { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return new Response("缺少 id", { status: 400 });
  await deleteProfileForUser(s.uid, id);
  return Response.json({ ok: true });
}

export async function POST(req: Request): Promise<Response> {
  const s = await uid(); if (!s) return new Response("未登录", { status: 401 });
  const body = await req.json().catch(() => ({}));
  const parsed = BirthInputSchema.safeParse(body?.birthInput);
  if (!parsed.success) return new Response(parsed.error.issues.map((i) => i.message).join("; "), { status: 400 });
  // 原来是 `catch (e)` 却从不用 e——500 的真实原因被整个丢掉，线上无从排查
  // （lint 报的是未使用变量，但底下藏着的是「会自我掩盖的失败模式」）。补一行日志。
  let chart;
  try { chart = computeUnifiedChart(parsed.data); }
  catch (e) { console.error("[tg/profile] computeUnifiedChart failed", e); return new Response("排盘失败", { status: 500 }); }
  try {
    const profile = await createProfileForUser(s.uid, { nickname: body?.nickname, birthInput: parsed.data, chart });
    return Response.json({ profile });
  } catch (e) {
    if (e instanceof Error && e.message === "profile_limit") {
      return Response.json({ error: "limit" }, { status: 402 });
    }
    throw e;
  }
}
