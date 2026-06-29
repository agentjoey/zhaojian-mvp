# 照见 Telegram 前端 · P4（分享裂变）Implementation Plan

> 执行者 `kimi`，reviewer `claude`。kimi 只改列出文件、不 commit、密钥只读 env。

**Goal:** 生成可分享的「命盘 / 今日运势」水墨卡片图，bot 内一键分享到群/好友，并用 `start_param` 做来源归因。
**Architecture:** Next OG ImageResponse（`next/og`，确定性渲染、无 LLM）生成 PNG → bot `/share` 发送图片 + Mini App 深链（`t.me/<bot>?startapp=<ref>`）；`/start <ref>` 记录归因。
**Tech Stack:** `next/og` (ImageResponse, runtime nodejs/edge) · grammY `replyWithPhoto` · `@eamvp/core`（确定性事实）。

## Global Constraints
- 卡片内容**全确定性**（命主/日主/主导五行/五维评分/干支）——无 LLM、无成本、无幻觉。素白水墨基调（与 app 一致）。
- 不泄露隐私：卡片只放用户昵称 + 命理符号，不放出生日期/坐标。
- 归因：`start_param`/`startapp` 记到 `tg_users.ref`（首次 /start 时若带 ref 且本人 ref 为空则记）。
- 不碰非 TG web；密钥仅 env。

## File Structure（P4）
- Create `supabase/migrations/0008_tg_ref.sql` — `tg_users.ref text`（kimi 写、claude apply）。
- Create `apps/web/app/api/tg/card/route.ts` — OG ImageResponse 生成卡片 PNG（GET `?type=chart|today` + session cookie）。
- Modify `apps/web/lib/tg/bot.ts` — `/share` 命令（发卡片图 + 分享深链）；`/start` 解析 `ctx.match`(start_param) 记 ref。
- Modify `apps/web/lib/tg/identity.ts` — `resolveOrCreateTgUser` 加可选 ref 入参，首次创建/为空时写入。
- Modify `apps/web/.env.example` — 记 `NEXT_PUBLIC_TG_BOT_USERNAME`（深链用）。

**Pact** feature `tg-p4`。

---

## Task 1（kimi 写 SQL / claude apply）：ref 列
**Files:** Create `supabase/migrations/0008_tg_ref.sql`
```sql
alter table public.tg_users add column if not exists ref text;
```
- [ ] kimi 写；claude apply（name `tg_ref`）。提交 `feat(db): tg_users.ref 归因列 [EP-tg-P4-1]`。

## Task 2（kimi）：卡片 OG 路由
**Files:** Create `apps/web/app/api/tg/card/route.ts`
**Consumes:** `next/og` ImageResponse；`readSession`/`TG_COOKIE`；`getProfileForUser`(identity)；`@eamvp/core` `deriveSpirit`/`computeDailyFortune`。
- [ ] Step 1: `export const runtime = "nodejs";`（与既有 tg 路由一致；ImageResponse 在 node 可用）。GET：读 cookie→session；无→401。`type = searchParams.get("type")||"chart"`。getProfileForUser→profile；无→404。
- [ ] Step 2: 用 `new ImageResponse(<JSX>, { width:1080, height:1080 })` 渲染：
  - 背景素白(#f6f5f1)、朱砂点缀(#cb4636)、宋体大字。
  - chart 卡：昵称 + archetype(deriveSpirit) + 主导五行 + 日主/命主 + 「照见 · 东方占星」落款。
  - today 卡：昵称 + 今日干支(computeDailyFortune) + 五维条 + 日期 + 落款。
  - 仅用内联 style（OG 不支持外部 CSS/Tailwind）；中文字体：用系统可用字体或 fetch 一个 woff（若无中文字体会豆腐块——**优先用 `@vercel/og` 的 font 选项加载一份中文 woff**：从 public 放一个 NotoSerifSC subset，或 fetch。若复杂，先英文/数字+少量中文测，font 缺失问题在 review 时处理）。
- [ ] Step 3: claude 验证（带 cookie GET /api/tg/card?type=chart → 返回 image/png）。提交 `feat(tg): 分享卡片 OG 路由 [EP-tg-P4-2]`。
**验收：** 返回 PNG；chart/today 两类；中文正常显示（字体加载）。

## Task 3（kimi）：bot /share + 归因
**Files:** Modify `apps/web/lib/tg/bot.ts`、`apps/web/lib/tg/identity.ts`
- [ ] Step 1: identity `resolveOrCreateTgUser(tg, chatId, ref?)`：新建时写 ref；已存在且 ref 为空且传入 ref 则补写。
- [ ] Step 2: bot `/start`：`const ref = ctx.match?.trim() || undefined;` 传入 resolveOrCreateTgUser。
- [ ] Step 3: bot `command("share")`：resolve→profile；无→引导起盘。卡片图 URL = `${MINIAPP_URL}/api/tg/card?type=chart`——但 card 路由需 cookie（webview 才有），bot 直接取图无 cookie。**改用**：bot 侧用 `getBot().api.sendPhoto` 传一个**带签名 token 的公开卡片 URL**，或更简单——bot 不发图，发**分享深链**：`const link = `https://t.me/${process.env.NEXT_PUBLIC_TG_BOT_USERNAME}?startapp=u${u.id}`;` + 文案「把照见分享给朋友：{link}」。卡片图改由 **Mini App 内**「分享」按钮调用（webview 有 cookie，能取 /api/tg/card 并用 `Telegram.WebApp` 分享）。→ 故 Task3 bot 侧只做深链分享 + ref 归因；卡片图在 Task 4 的 Mini App 内。
- [ ] Step 4: build。提交 `feat(tg): /share 深链 + start_param 归因 [EP-tg-P4-3]`。
**验收：** /share 回分享深链；带 ref 的 /start 记 tg_users.ref（claude 真机/DB 验）。

## Task 4（kimi）：Mini App 内分享按钮（卡片图）
**Files:** Modify `apps/web/app/chart/page.tsx`（或 SpiritSigil 附近）加「分享命盘」按钮（仅 isTelegram()）。
- [ ] Step 1: isTelegram() 下显示「分享命盘卡片」按钮 → fetch `/api/tg/card?type=chart`（credentials include）得 blob → 用 `Telegram.WebApp` 分享能力（`shareToStory` 若可用，或下载/复制深链）。最简：按钮调用 `(window as any).Telegram.WebApp.openTelegramLink('https://t.me/share/url?url='+encodeURIComponent(link))` 分享深链；卡片图作为可选增强。
- [ ] Step 2: build + claude 真机。提交 `feat(tg): Mini App 分享按钮 [EP-tg-P4-4]`。
**验收：** TG 内出现分享入口、可把深链分享出去；非 TG 无此按钮。

## P4 上线（claude）
- 配 Vercel env `NEXT_PUBLIC_TG_BOT_USERNAME`（=当前 bot username，如 analyst_helen_bot；换专属 bot 后更新）。合 main→push→部署。真机验 /share + 卡片 + ref 归因。更新 CURRENT.md+memory。

## 编排
owner kimi / reviewer claude（pact `tg-p4`）。T1(DB)→T2(卡片)→T3(bot 深链+归因)→T4(Mini App 分享)。注：卡片中文字体是主要风险点，review 时重点验证。
