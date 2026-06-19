# Deployment — Eastern-Astrology-MVP

> ⚠️ 占位：Web 框架由 [ADR-001](decisions/ADR-001-tech-stack.md) 拍板后补全完整手册。以下为推荐路径（Next.js + Vercel）。

## 环境变量
见 `.env.example`。生产用 `vercel env` 管理：
| Key | 用途 |
|-----|------|
| `ANTHROPIC_API_KEY` | Claude API（或 `AI_GATEWAY_API_KEY` 走 Vercel AI Gateway）|
| `LLM_MODEL` | 默认 `claude-opus-4-8` |
| `ZIWEI_MUTAGEN_SCHOOL` | 紫微四化流派，默认 `zhongzhou` |

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
