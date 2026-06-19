# Operations — Eastern-Astrology-MVP

> 日常运维 + 故障排查。MVP 阶段（无 DB / 无账号）运维面很薄，主要关注排盘正确性与 LLM 调用。

## 健康检查清单
- [ ] 排盘金标准用例通过（跨立春/跨节气/早晚子时/真太阳时；见 `packages/core/test`）
- [ ] LLM 调用成功率、P95 延迟、`stop_reason:"refusal"` 比例
- [ ] 免责声明在结果页正确展示

## 常见故障排查
| 症状 | 可能原因 | 排查 |
|------|---------|------|
| 命盘四柱错误 | 真太阳时/子时归日未生效；时区/历史 DST | 检查 normalize 输出的「实际计算时刻」；对照 iztro/lunar 已知案例 |
| 紫微星曜错位 | iztro `timeIndex` 用了小时而非时辰索引 | 改用 `astro.getTimeIndex`；核对晚子时 |
| 西方盘缺失 | 缺纬度或时辰未知 → `western=null`（预期降级） | 确认输入；非 bug |
| 四化与预期流派不符 | `ZIWEI_MUTAGEN_SCHOOL` 配置 | 核对 iztro `configure({ mutagen })` |
| LLM 编造星曜/事件预测 | 提示词守护栏失效 | 检查 `SYNTHESIS_GUARDRAILS`；确认只喂事实 JSON |
| LLM 返回 refusal | 触发安全边界（健康/生死/财务预测）| 优雅降级，提示用户换问法；强化非决定论措辞 |
| `next dev` 退出 1 / `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` / "Another next dev server is already running" | 端口被占（本机 **Hermes WhatsApp bridge 常驻 :3000**），Next 退到 3001 后 abort | Web 已固定端口 **3030**（`apps/web` dev/start 脚本 `-p 3030`）。查占用：`lsof -nP -iTCP:3030 -sTCP:LISTEN`；清掉：`lsof -nP -iTCP:3030 -sTCP:LISTEN -t \| xargs kill -9` |
| `/api/reading` 返回 503「LLM 未配置」 | 无 `LLM_API_KEY` | 设置 key：`apps/web/.env.local` 写 `LLM_API_KEY=sk-cp…`（gitignored），或 env 注入；默认 provider=minimax(anthropic 线) |

## 本地 / 局域网运行

| 命令 | 用途 |
|------|------|
| `pnpm --filter @eamvp/web dev` | 本机开发，固定端口 **3030**（避开 :3000 的 Hermes WhatsApp bridge） |
| `pnpm --filter @eamvp/web dev:lan` | 绑定 `0.0.0.0:3030`，**局域网可访问** |

**局域网访问步骤：**
1. 起 `dev:lan`，日志出现 `Network: http://0.0.0.0:3030`。
2. 查本机 LAN IP：`ipconfig getifaddr en1`（en1 可能因机器而异；当前 = `192.168.0.14`）。
3. 同 WiFi/网段设备访问 `http://<LAN-IP>:3030`。
4. **MiniMax key** 从 `apps/web/.env.local` 自动加载（service `minimax-api-key`，gitignored）。

**连不上排查：**
| 症状 | 原因 | 处理 |
|------|------|------|
| 本机能开、别的设备连不上 | macOS 防火墙（`socketfilterfw --getglobalstate` = 1）拦 node 入站 | `sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node && sudo ... --unblockapp /usr/local/bin/node` |
| 远端完全不通 | 远端不在同一局域网（本机默认路由走 VPN `ipsec0`） | 改用内网穿透（cloudflared/ngrok）或让远端连同一网段/VPN |
| 地址访问不到、IP 变了 | `192.168.0.14` 是 DHCP 分配，重启路由器/换网会变 | 重新 `ipconfig getifaddr en1` |

> ⚠️ **安全**：LAN 暴露 `/api/reading` 会消耗 MiniMax 额度（任何同网段设备可调用）。仅可信网络临时使用，用完停服。
> 停服：`lsof -nP -iTCP:3030 -sTCP:LISTEN -t | xargs kill -9`

## 合规要点（常驻）
- 输出禁含医疗/法律/财务/生死的决定论判断；健康/心理危机内容路由到专业资源。
- 出生信息视为敏感个人信息：MVP 不落库优先；引入存储后加密 + 可删除。
- 内容定位「自我反思/文化研究」，规避「迷信/算命」表述（见 `research/competitor-analysis.md §5` 合规策略）。

## 遇 Bug 流程
按 orchestration-spec §5.3 + `superpowers:systematic-debugging`；P0/P1 记入 `.agent/CURRENT.md` Open Bugs。
