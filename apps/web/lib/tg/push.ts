import { computeDailyFortune } from "@eamvp/core";
import { generateDailySpiritGreeting } from "@eamvp/llm";
import { supabaseAdmin } from "./admin";
import { getBot } from "./bot";
import { getMemory } from "./data";
import { getProfileForUser } from "./identity";

export type DueUser = {
  tg_user_id: number;
  tg_chat_id: number;
  tz: string;
  push_hour: number;
  supabase_user_id: string;
  localDate: string;
};

export async function dueUsers(now: Date): Promise<DueUser[]> {
  const { data } = await supabaseAdmin()
    .from("tg_users")
    .select("tg_user_id,tg_chat_id,tz,push_hour,supabase_user_id,last_push_date")
    .eq("daily_push", true)
    .not("tg_chat_id", "is", null);

  const out: DueUser[] = [];
  for (const u of data ?? []) {
    const tz = u.tz || "Asia/Shanghai";
    const hour =
      Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          hour: "numeric",
          hour12: false,
        }).format(now),
      ) % 24;
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    if (hour === (u.push_hour ?? 8) && u.last_push_date !== localDate) {
      out.push({
        tg_user_id: u.tg_user_id,
        tg_chat_id: u.tg_chat_id,
        tz,
        push_hour: u.push_hour ?? 8,
        supabase_user_id: u.supabase_user_id,
        localDate,
      });
    }
  }
  return out;
}

export async function pushDailyTo(u: DueUser): Promise<boolean> {
  try {
    const profile = await getProfileForUser(u.supabase_user_id);
    if (!profile) return false;

    const daily = computeDailyFortune(profile.chart, u.localDate);
    const mem = await getMemory(profile.id);

    let greeting = "";
    try {
      greeting = (
        await generateDailySpiritGreeting(profile.chart, daily, u.localDate, {
          language: "zh",
          memory: mem ?? undefined,
        })
      ).text;
    } catch {
      greeting = "";
    }

    const DIM_CN: Record<string, string> = { overall: "总评", career: "事业", wealth: "财运", love: "情感", health: "健康", travel: "出行" };
    const dims = Object.entries(daily.scores)
      .map(([k, v]) => `${DIM_CN[k] ?? k} ${v}`)
      .join(" · ");
    const text = `🌙 今日 ${daily.dayGanZhi}\n${dims}\n\n${greeting}`.trim();

    await getBot().api.sendMessage(u.tg_chat_id, text);
    await supabaseAdmin()
      .from("tg_users")
      .update({ last_push_date: u.localDate })
      .eq("tg_user_id", u.tg_user_id);
    return true;
  } catch {
    return false;
  }
}
