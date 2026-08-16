import { waitUntil } from "@vercel/functions";
import type { Update } from "grammy/types";
import { getBot } from "@/lib/tg/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vercel Hobby 的函数默认时长上限是 **10 秒**，而本路由里最慢的 handler（`/today`、
 * 自由聊天）包着一次完整的 LLM 生成（客户端 60s 超时 + 退避重试）。此前没有任何
 * `maxDuration` 配置，函数会在 LLM 返回之前被杀掉。60 是 Hobby 的上限。
 */
export const maxDuration = 60;

/**
 * `bot.handleUpdate()` 要求 `bot.botInfo` 已就绪（`webhookCallback` 内部会代劳，
 * 直接调用则要自己 init）。单例 promise：并发请求共用同一次 init，不重复打 getMe。
 */
let inited: Promise<void> | null = null;

/**
 * Telegram webhook 入口。
 *
 * ⚠️ **必须先回 200，再处理 update，不能反过来。**
 *
 * 此前这里是 `webhookCallback(getBot(), "std/http")`，它会 **await 整个 handler**
 * 才返回响应。于是 `/today` 的链路是：3~4 次 DB 往返 + 一次 LLM 生成 → 远超函数
 * 时长上限 → Telegram 收不到 200 → **重投同一条 update** → 而代码里没有任何
 * `update_id` 去重 → 重新跑一遍 handler → 又一次全新的 LLM 生成。
 *
 * 线上表现：一条 `/today` 回三条**内容各不相同**的今日问候，且因为三次生成并发
 * 完成、先后不定，顺序还是乱的。（内容不同这一点正好排除了「一条被切成三段」。）
 *
 * 现在：立刻回 200 让 Telegram 销账，真正的处理交给 `waitUntil` 在响应之后继续跑。
 *
 * 残留风险（已知，未做）：仍无 `update_id` 幂等。快速 ACK 之后 Telegram 不会再因
 * 超时重投，但网络层重复投递仍可能导致重复处理。要彻底兜住需要一张去重表
 * （`insert … on conflict do nothing`，影响行数为 0 即跳过），那是一次生产迁移。
 */
export async function POST(req: Request): Promise<Response> {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET)
    return new Response("forbidden", { status: 403 });

  const update = (await req.json().catch(() => null)) as Update | null;
  if (!update) return new Response("bad request", { status: 400 });

  const bot = getBot();
  inited ??= bot.init();
  await inited;

  // 处理失败不能让 Telegram 重投（重投正是本次要修的 bug），所以吞掉异常只留日志。
  waitUntil(
    bot.handleUpdate(update).catch((e) => {
      console.error("[tg/webhook] handleUpdate failed", { updateId: update.update_id, error: e });
    }),
  );

  return new Response("ok");
}
