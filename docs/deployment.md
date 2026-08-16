# Deployment — Eastern-Astrology-MVP

> ⚠️ 占位：Web 框架由 [ADR-001](decisions/ADR-001-tech-stack.md) 拍板后补全完整手册。以下为推荐路径（Next.js + Vercel）。

## 环境变量
见 `.env.example`。生产用 `vercel env` 管理（下表对齐 2026-08-16 `vercel env ls` 实况）：

| Key | 用途 |
|-----|------|
| `LLM_API_KEY` | LLM 密钥。默认 MiniMax-M3 走 anthropic 兼容线（`sk-cp…`）；兼容读取 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` 作为回退 |
| `LLM_PROVIDER` / `LLM_MODEL` / `LLM_BASE_URL` / `LLM_WIRE` | 可插拔 LLM，未设时用 MiniMax-M3 默认值（见 CLAUDE.md）|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器侧 Supabase（匿名会话 + RLS）|
| `SUPABASE_SERVICE_ROLE_KEY` | 服务端 Supabase。**仅限 route handler，绕过 RLS**，绝不可进客户端包 |
| `TELEGRAM_BOT_TOKEN` | Bot API。**未配置时 `next build` 会在 `/api/tg/webhook` 的 page-data 收集阶段失败**——本地裸构建报 `TELEGRAM_BOT_TOKEN 未配置` 属此原因，带占位值即可通过 |
| `TELEGRAM_WEBHOOK_SECRET` | webhook 校验 + TG session cookie 的 HMAC 签名密钥 |
| `NEXT_PUBLIC_TG_BOT_USERNAME` / `NEXT_PUBLIC_MINIAPP_URL` | TG 登录 widget 与 Mini App 地址 |
| `TG_QUOTA_DISABLED` | 关闭 TG 侧配额（灰度用）|
| `CRON_SECRET` | `/api/tg/cron` 的调用凭据 |
| `NEXT_PUBLIC_SPIRIT_ENABLED` | 本命之灵 flag，`=1` 开启 |
| `NEXT_PUBLIC_FENGSHUI_ENABLED` | 风水「境」flag，`=1` 开启。**2026-08-16 起 Production + Preview 均已设为 1** |
| `BILLING_ENABLED` | 会员闸门总开关。**不为 `"1"`（默认）时不做任何限制**——注意它**没有** `NEXT_PUBLIC_` 前缀，客户端读不到，故页面须向服务端探测权益 |

⚠️ `NEXT_PUBLIC_*` 是**构建期内联**的：改这类变量后必须**重新部署**才生效，光改 env 不重建不会有任何变化。

## 推荐部署（待确认）
- **平台：** Vercel（Next.js App Router 原生，Fluid Compute）。
- **计算：** 排盘 + LLM 调用在 Server Action / Route Handler，密钥不出服务端。
- **持久化：** MVP 无需 DB。引入保存报告/账号时，经 Vercel Marketplace 接 Neon(Postgres) 或 Supabase。
- **命令（框架确定后补）：**
  ```bash
  pnpm install
  pnpm build
  vercel deploy            # preview
  vercel deploy --prod     # production
  ```

## 发布
```bash
./scripts/release.sh [patch|minor|major]   # 自动 bump 版本 + 同步 .agent/CURRENT.md & CLAUDE.md
# 随后手动补 Version History 描述（PostBash Hook 会提醒），再 git commit + tag
```
