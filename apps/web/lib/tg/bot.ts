import { Bot, InlineKeyboard } from "grammy";
import { resolveOrCreateTgUser, getProfileForUser } from "./identity";
let _bot: Bot | null = null;
const MINIAPP_URL = process.env.NEXT_PUBLIC_MINIAPP_URL || "https://zhaojian-mvp.vercel.app";
export function getBot(): Bot {
  if (_bot) return _bot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN 未配置");
  const bot = new Bot(token);
  bot.command("start", async (ctx) => {
    const u = ctx.from!; 
    const { supabaseUserId } = await resolveOrCreateTgUser({ id: u.id, username: u.username, lang: u.language_code }, ctx.chat.id);
    const has = await getProfileForUser(supabaseUserId);
    const kb = new InlineKeyboard().webApp(has ? "🔮 打开照见" : "📿 起盘 · 打开照见", MINIAPP_URL + (has ? "/spirit" : "/reading"));
    await ctx.reply(has ? "欢迎回到照见。点开看你的命盘与本命之灵：" : "欢迎来到照见——东方命理 × 西方心理的自我观照。先起盘，看见你自己：", { reply_markup: kb });
  });
  _bot = bot; return bot;
}
