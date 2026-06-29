import { webhookCallback } from "grammy";
import { getBot } from "@/lib/tg/bot";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handle = webhookCallback(getBot(), "std/http");
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET)
    return new Response("forbidden", { status: 403 });
  return handle(req);
}
