import { Bot, InlineKeyboard } from "grammy";
import { computeDailyFortune, formatQuestionnaire } from "@eamvp/core";
import { streamSpiritChat, generateDailySpiritGreeting, summarizeSpiritMemory } from "@eamvp/llm";
import { resolveOrCreateTgUser, getProfileForUser } from "./identity";
import { listMessages, appendMessage, getMemory, saveMemory, getQuestionnaire } from "./data";
import { consumeQuota } from "./quota";

let _bot: Bot | null = null;
const MINIAPP_URL = process.env.NEXT_PUBLIC_MINIAPP_URL || "https://zhaojian-mvp.vercel.app";

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  bot.command("today", async (ctx) => {
    const u = ctx.from!;
    const { supabaseUserId } = await resolveOrCreateTgUser({ id: u.id, username: u.username, lang: u.language_code }, ctx.chat.id);
    const profile = await getProfileForUser(supabaseUserId);
    if (!profile) {
      await ctx.reply("先发 /start 起盘，我才能为你看今日。");
      return;
    }
    const dateStr = todayYmd();
    const daily = computeDailyFortune(profile.chart, dateStr);
    await ctx.replyWithChatAction("typing");
    const mem = await getMemory(profile.id);
    const qa = await getQuestionnaire(profile.id);
    const q = qa ? formatQuestionnaire(qa) : undefined;
    if (await consumeQuota(u.id)) {
      const { text } = await generateDailySpiritGreeting(profile.chart, daily, dateStr, { language: "zh", memory: mem ?? undefined, questionnaire: q });
      await ctx.reply(text);
    } else {
      await ctx.reply(`今日 ${daily.dayGanZhi}。免费问今额度已用完——订阅即将开放。`);
    }
  });
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const u = ctx.from!;
    const { supabaseUserId } = await resolveOrCreateTgUser({ id: u.id, username: u.username, lang: u.language_code }, ctx.chat.id);
    const profile = await getProfileForUser(supabaseUserId);
    if (!profile) {
      await ctx.reply("先发 /start 起盘，我们才能开始对话。");
      return;
    }
    await ctx.replyWithChatAction("typing");
    if (!(await consumeQuota(u.id))) {
      await ctx.reply("你的免费畅聊额度已用完——订阅即将开放，先以你已有的解读慢慢回味。");
      return;
    }
    const history = await listMessages(profile.id);
    const recent = history.slice(-12);
    const mem = await getMemory(profile.id);
    const qa = await getQuestionnaire(profile.id);
    const q = qa ? formatQuestionnaire(qa) : undefined;
    const turns = recent.map((m) => ({ role: m.role, content: m.content }));
    turns.push({ role: "user", content: ctx.message.text });
    let full = "";
    for await (const c of streamSpiritChat(profile.chart, turns, { language: "zh", memory: mem ?? undefined, questionnaire: q })) {
      full += c;
    }
    await appendMessage(profile.id, "user", ctx.message.text);
    await appendMessage(profile.id, "spirit", full);
    await ctx.reply(full);
    summarizeSpiritMemory([...turns, { role: "spirit", content: full }], mem ?? undefined)
      .then((m) => {
        if (m) void saveMemory(profile.id, m);
      })
      .catch(() => {});
  });
  _bot = bot; return bot;
}
