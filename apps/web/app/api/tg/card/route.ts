import { ImageResponse } from "next/og";
import { cookies } from "next/headers";
import * as React from "react";
import { deriveSpirit, computeDailyFortune } from "@eamvp/core";
import { readSession, TG_COOKIE } from "@/lib/tg/session";
import { getProfileForUser } from "@/lib/tg/identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FONT_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc@5/files/noto-serif-sc-chinese-simplified-700-normal.woff";

const ELEMENT_CN: Record<string, string> = {
  wood: "木",
  fire: "火",
  earth: "土",
  metal: "金",
  water: "水",
};

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

async function sess() {
  const c = (await cookies()).get(TG_COOKIE)?.value;
  return readSession(c);
}

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(FONT_URL);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET(req: Request): Promise<Response> {
  const s = await sess();
  if (!s) return new Response("未登录", { status: 401 });

  const profile = await getProfileForUser(s.uid);
  if (!profile) return new Response("无档案", { status: 404 });

  const type = new URL(req.url).searchParams.get("type") || "chart";

  const fontData = await loadFont();
  const fonts = fontData
    ? [
        {
          name: "NotoSerifSC",
          data: fontData,
          style: "normal" as const,
          weight: 700 as const,
        },
      ]
    : [];

  const brand = "照见 · 东方占星";
  const footerNote = "· 自我观照，非预言";
  const bg = "#f6f5f1";
  const ink = "#1a1a1a";
  const cinnabar = "#cb4636";

  const containerStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: bg,
    color: ink,
    fontFamily: "NotoSerifSC, serif",
    padding: 80,
    lineHeight: 1.4,
  };

  let body: React.ReactElement;

  if (type === "today") {
    const daily = computeDailyFortune(profile.chart, todayYmd());
    const scores = daily.scores;
    const items = [
      { label: "总评", value: scores.overall },
      { label: "事业", value: scores.career },
      { label: "财运", value: scores.wealth },
      { label: "情感", value: scores.love },
      { label: "健康", value: scores.health },
      { label: "出行", value: scores.travel },
    ];

    body = React.createElement(
      "div",
      { style: containerStyle },
      React.createElement(
        "div",
        { style: { fontSize: 28, letterSpacing: 4, opacity: 0.7, marginBottom: 40 } },
        brand,
      ),
      React.createElement(
        "div",
        { style: { fontSize: 56, marginBottom: 24, textAlign: "center" } },
        profile.nickname,
      ),
      React.createElement(
        "div",
        { style: { fontSize: 40, color: cinnabar, marginBottom: 60, textAlign: "center" } },
        `今日 ${daily.dayGanZhi}`,
      ),
      React.createElement(
        "div",
        {
          style: {
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 32,
            maxWidth: 840,
            marginBottom: 60,
          },
        },
        items.map((it) =>
          React.createElement(
            "div",
            {
              key: it.label,
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                width: 140,
              },
            },
            React.createElement(
              "div",
              { style: { fontSize: 28, opacity: 0.75, marginBottom: 8 } },
              it.label,
            ),
            React.createElement(
              "div",
              { style: { fontSize: 48, color: cinnabar, fontWeight: 700 } },
              String(it.value),
            ),
          ),
        ),
      ),
      React.createElement(
        "div",
        { style: { fontSize: 28, opacity: 0.7 } },
        daily.date,
      ),
      React.createElement("div", { style: { flex: 1 } }),
      React.createElement(
        "div",
        { style: { fontSize: 24, opacity: 0.5, marginTop: 40 } },
        footerNote,
      ),
    );
  } else {
    const spirit = deriveSpirit(profile.chart);
    const elementCn = ELEMENT_CN[spirit.dominantElement] ?? spirit.dominantElement;

    body = React.createElement(
      "div",
      { style: containerStyle },
      React.createElement("div", { style: { flex: 1 } }),
      React.createElement(
        "div",
        { style: { fontSize: 30, letterSpacing: 4, opacity: 0.7, marginBottom: 60 } },
        brand,
      ),
      React.createElement(
        "div",
        { style: { fontSize: 96, marginBottom: 36, textAlign: "center" } },
        profile.nickname,
      ),
      React.createElement(
        "div",
        { style: { fontSize: 48, color: cinnabar, marginBottom: 20, textAlign: "center" } },
        `${spirit.archetype} · 主导五行 ${elementCn}`,
      ),
      React.createElement("div", { style: { flex: 1 } }),
      React.createElement(
        "div",
        { style: { fontSize: 28, opacity: 0.75, marginBottom: 16 } },
        `日主 ${profile.chart.bazi.dayMaster}`,
      ),
      React.createElement(
        "div",
        { style: { fontSize: 24, opacity: 0.5 } },
        footerNote,
      ),
    );
  }

  return new ImageResponse(body, {
    width: 1080,
    height: 1080,
    fonts,
  });
}
