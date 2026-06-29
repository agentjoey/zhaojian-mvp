import { dueUsers, pushDailyTo } from "@/lib/tg/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("forbidden", { status: 401 });
  }

  const now = new Date();
  const due = await dueUsers(now);
  let sent = 0;
  for (const u of due) {
    if (await pushDailyTo(u)) sent++;
  }

  return Response.json({ due: due.length, sent });
}
