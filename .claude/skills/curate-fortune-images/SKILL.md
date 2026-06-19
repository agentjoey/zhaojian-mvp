---
name: curate-fortune-images
description: 为「照见」运势日历生成、筛选、打标签并入库水墨配图。当需要扩充/补充运势配图库（EP-cal-img），或用户说「补图/筛图/curate fortune images」时使用。
---

# 运势配图 筛图流水线（EP-cal-img · A 混合制）

目标：把 AI 生成的水墨图，按「**纯水墨写意**」基调严格筛选、打**意境标签**、存入仓库供运势日历按规则选用。
配图须与当日命理流日的情绪一致，对用户形成**心理暗示**。

## 风格铁律（筛图唯一标准 —— 不达标即弃）
参照基调：留白宣纸、米色底、墨色浓淡晕染、雾气朦胧、朱红方印、极简禅意（如「孤舟入云雾」）。
**拒绝**：① 任何彩色/绿色（竹、花、青山易出彩 → 弃）② 有文字/糊乱印章 ③ 写实照片感/卡通 ④ 构图杂乱、留白不足 ⑤ 与目标情绪不符。
只留：黑白纯水墨、大量留白、一枚干净朱印、意境清晰的。

## 意境标签（十神情绪 → 题材，均取「易出纯墨」的题材，避开竹/花）
| 情绪 mood | 题材（写意） | caption 示例 |
|---|---|---|
| 比和（协作同行）| 双峰并峙云海 / 二帆同向 | 双峰并峙，今日宜与人同行 |
| 印（休整蓄力）| 深山草庐 / 平湖淡月 | 静水深潭，今日宜养息蓄力 |
| 食伤（表达抒发）| 群鸟掠水 / 风过寒林 | 飞鸟掠空，今日宜抒怀表达 |
| 财（行动掌控）| 孤舟破雾前行 / 长河远帆 | 孤舟破雾，今日宜把握节奏 |
| 官杀（守静自持）| 孤峰寒江 / 寒江独钓 | 孤峰独峙，今日宜守静自持 |

## 流程
1. **生成候选**（每情绪 ≥2 张，挑「易出纯墨」题材）。MiniMax `image-01`：
   ```bash
   KEY="$(grep '^LLM_API_KEY=' apps/web/.env.local | cut -d= -f2-)"
   STYLE="纯水墨黑白，仅以墨色浓淡晕染，绝无任何彩色与绿色，米色宣纸大量留白，雾气朦胧，极简禅意，一枚朱红方印，画面干净无文字"
   curl -s -X POST https://api.minimax.io/v1/image_generation \
     -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
     -d "{\"model\":\"image-01\",\"prompt\":\"<题材>，$STYLE\",\"aspect_ratio\":\"3:2\",\"n\":1,\"response_format\":\"url\"}"
   # 取 data.image_urls[0]（注意 &→&），curl 下载到 /tmp/fc/<mood>-<n>.jpeg
   ```
2. **筛图（reviewer）**：用 Read 工具逐张看图。按上方「风格铁律」判定 通过/淘汰。
   - 初期人工判（本 skill 当前阶段）；样本积累后，本步骤即「agent reviewer」自动化的位置——把判定写成结构化输出（{file, pass, reason, mood, element}）。
3. **入库**：通过的图
   - 命名 `<mood>-<n>.jpeg`，移到 `apps/web/public/fortune/`；
   - 在 `apps/web/lib/fortune-images.ts` 的 `FORTUNE_IMAGES` 追加一条：`{ file:"/fortune/<mood>-<n>.jpeg", moods:[...], caption:"...", alt:"..." }`（caption 须含「今日宜…」式心理暗示）。
4. **验证**：`pnpm --filter @eamvp/web build`；可本地起服务看 `/calendar` 配图与意境是否相符。
5. 清理 `/tmp/fc`。

## 注意
- 库小阶段图存仓库 `public/fortune/`（git + Vercel CDN）；量大再迁 CDN/Storage，只需把 manifest 的 `file` 换 URL，`matchFortuneImage` 不变。
- 同一情绪多图 → `matchFortuneImage` 按日期确定性轮选（同一天稳定）。
- 切勿把跑偏（彩色/写实）的图入库——配图风格不一致会破坏照见基调。
