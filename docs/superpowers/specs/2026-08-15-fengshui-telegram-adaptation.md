# 风水「境」· Telegram 适配 — Design Spec

- **Date:** 2026-08-15
- **Status:** Draft（待 worker 实施）
- **代号前缀:** `EP-fs-tg-*`
- **背景:** 风水波 1（Layer 0 本命方位）与波 2（Layer 1 住宅实盘）已交付，数据路径已支持 TG，但 **UI 完全没做 TG 原生化**，且 `api/tg/` 下没有风水的中介端点
- **范围:** 仅 `apps/web`。**不改** core / llm / 数据库 / 既有非风水页面
- **Flag:** 全程 `NEXT_PUBLIC_FENGSHUI_ENABLED` 门控，默认关闭

---

## 1. 问题

风水功能在 Telegram Mini App 里目前是「网页塞进 webview」——而这个项目已经为其他界面做过**两轮** TG 原生化（见 `.agent/CURRENT.md` 的「TG 原生 UI 地基」「各界面」两条 Version History）。风水是唯一没跟上的一块。

具体两个缺口：

**① UI 零原生化。** `app/fengshui/` 下四个界面（境页、物件顾问、居所管理、居所表单）**零引用** `components/tg/`。对照 `app/profiles/page.tsx`：它用 `const inTg = mounted && isTelegram()` 分支，TG 内渲染 `<Group>` / `<Cell>` 原生列表。风水页在 TG 里会明显不同于其他页面。

**② `api/tg/` 下没有风水端点。** 现有 `app/api/tg/` 有 `spirit`/`daily`/`profile`/`questionnaire`/`session`/`card`/`cron`/`webhook`，**没有 fengshui**。风水的两个 route（`/api/fengshui/reading`、`/api/fengshui/object`）走的是 web 路径（Supabase 匿名会话 + RLS），而 TG 用户的身份链路是 `initData → TG cookie session → service_role 后端中介`。

目前 TG 内能工作，是因为 `hasTgSession()` 泛化了**档案读取**；但报告生成、居所增删改这些路径没有走 TG 的鉴权中介。

## 2. 数据路径的现状（不要误判为「全断」）

先说清楚哪些已经通了，避免过度改造：

| 能力 | TG 内现状 |
|---|---|
| 读当前档案 | ✅ 已通——页面用 `hasTgSession() ? tgGetProfile() : getActiveProfile()` |
| 生成风水报告 | ⚠️ 走 `/api/fengshui/reading`（web 路径），未经 TG 中介 |
| 居所增删改查 | ❌ `lib/dwellings.ts` 直接用 Supabase 匿名客户端 + RLS，TG 会话下拿不到正确的 uid |
| 报告持久化 | ❌ 同上（`lib/fengshui-report.ts`） |

**所以居所与报告持久化在 TG 内实际是不工作的**——这是本次要补的实质缺口，不只是观感问题。

## 3. 方案

### 3.1 后端：新增 `api/tg/fengshui` 中介端点

照搬 `app/api/tg/spirit/route.ts` 的既有范式：

```
读 TG cookie session（readSession + TG_COOKIE）
  → 未登录返回 401
  → getProfileForUser(s.uid) 取档案
  → 用 service_role 客户端读写 dwellings / fengshui_reports
  → localeFromRequest(req) 取语言
```

需要覆盖的操作：居所 列表/新建/更新/删除、报告 读取/写入、以及报告生成（转发到既有的 `generateFengshuiReading`）。

**端点形态由实施者定**（单个 route 用 method + action 区分，或拆多个子路由），但必须：
- 与既有 `api/tg/*` 的鉴权与错误码惯例一致（未登录 401、入参非法 400、LLM 未配置 503、生成失败 500）
- **服务端独立校验**，不信任客户端传来的 uid/档案 id

### 3.2 前端：数据层按会话分流

`lib/dwellings.ts` 与 `lib/fengshui-report.ts` 目前只有 web 一条路径。参照 `lib/tg/client.ts` 里既有的 `tgGetProfile`/`tgListProfiles` 写法，加 TG 分支：`hasTgSession()` 为真时走 `api/tg/fengshui`，否则走原路径。

**分流点放在数据层，不要散在各个页面**——页面只管调 `listDwellings()`，不该关心自己在哪个宿主里。

### 3.3 前端：UI 原生化

四个界面按 `app/profiles/page.tsx` 的既有模式加 `inTg` 分支：

| 界面 | TG 内呈现 |
|---|---|
| `/fengshui`（境页） | Tab 行改用原生分段观感；八方盘保持（它是 SVG，本就中性）；化解清单用 `<Group>` + `<Cell>` |
| `/fengshui/object`（物件顾问） | 表单项用原生 cell 观感；提交用 `useTgMainButton` 而非页内按钮 |
| `/fengshui/dwellings`（居所管理） | 列表用 `<Group>` + `<Cell>`；**删除确认改用页内两步确认**（见 §4） |
| `DwellingForm`（居所表单） | 保存用 `useTgMainButton`；选择器保持按钮网格（方位是空间信息，原生 cell 反而更差） |

可用原语：`components/tg/native.tsx` 的 `Section` / `Group` / `Cell` / `Bubble`；`lib/tg/ui.ts` 的 `useTgMainButton` / `useTgBackButton` / `haptics`。

**非 TG（普通 web）路径必须零变化**——这是既有两轮 TG 原生化都遵守的约束，回归验证以此为准。

## 4. 必须一并修掉的两处

这两处都是波 2 遗留、且都落在本次要重做的居所管理页上，顺手修比单开任务便宜。

### 4.1 原生 `confirm()`

`app/fengshui/dwellings/page.tsx:57` 的删除确认用的是**原生 `confirm()`**——这是全 app 唯一一处。项目既有的 `app/profiles/page.tsx` 用的是页内两步确认（`confirmDeleteId` 状态机：点删除 → 出现「确认删除?」+ 确认/取消），TG 与 web 两个分支都实现了。

原生阻塞对话框在 TG webview 里表现很差。改为与 `profiles` 页一致的页内两步确认——**web 与 TG 都改**，因为页内确认在两个宿主里都不差于原生弹窗。

### 4.2 编辑居所入口缺失（死代码）

`DwellingForm` 接受 `initial` prop 做编辑回显，**实现了、也有单测**，但 `dwellings/page.tsx` 从不传 `initial`，页面上也没有编辑入口——**该路径在生产环境不可达**。

波 2 的评审记录点名要在「Task 10 或 EP-fs-tg 一并处理」，Task 10 没做，所以落在这里。既然本次要重做居所管理页的列表，加一个编辑入口的边际成本很低。

**要么接上，要么删掉**——已实现但永远走不到的分支是纯负债：它会被后续改动破坏而无人察觉（单测仍绿，因为单测直接调组件、绕过了不存在的入口）。倾向接上（回显逻辑已经写好并测过）。若你判断接上有本 brief 没预见的障碍，说明理由并回报 claude，不要默默留着。

## 5. 已知陷阱（本项目真实踩过，请勿重蹈）

1. **中文方位名互相嵌套**：北/东/南/西 分别是 东北/东南/西南/西北 的**子串**。按方位名查元素或做字符串匹配时**必须精确匹配**（`^…$` 锚定或 `{ exact: true }`）。这个坑在本项目已经咬过三次（守卫正则一次、`getByRole` 一次、`getByText` 一次）。
2. **测试里 `vi.resetModules()` + 动态 import 页面时，`I18nProvider` 必须在同一处动态 import**，否则拿到两份不同的 Context 实例、`useT` 抛错。波 1、波 2 都踩过。
3. **`packages/core/tsconfig.json` 的 `include` 只有 `["src"]`**——core 的 `test/` 目录不过类型检查。写在那里的「这段不该编译」断言无效。（本 spec 范围在 `apps/web`，其 tsconfig 覆盖测试文件，但知道这件事有好处。）
4. **`Array.prototype.sort` 原地排序**：facts / 派生结果在本项目是「算一次、下游只读」，排序前必须 `[...arr]` 复制。波 1 曾因此永久打乱调用方数组。
5. **颜色必须走 CSS 令牌**（`var(--color-*)`），不要硬编码色值——项目在 TG 暗色主题上专门栽过一次并做过根因修复。

## 6. 验收标准

### 功能
- TG 会话下：居所可增删改查、报告可生成与持久化、合看可用（这些目前在 TG 内不工作）
- 四个界面在 TG 内呈现原生观感，与既有 `profiles`/`spirit` 页风格一致
- **非 TG web 路径行为零变化**

### 质量
- `pnpm --filter @eamvp/web test` 全绿；新增功能有测试
- `pnpm typecheck` 全 monorepo exit 0
- `pnpm --filter @eamvp/web build` 通过
- flag 关闭时：导航无「境」、`/fengshui` 不可达、既有 6 条路由行为不变

### 测试判别力（本项目的硬要求）
本项目在前两波累计出现 **8 次**「断言抓不到它声称要防的 bug」——包括 `f(f(x))===x` 对恒等函数同样成立、`toBeGreaterThan(0)` 抓不到「少算一半」、断言查的字符串实现根本不会输出、硬要求实现对了但改回硬编码全部测试仍绿。

因此：**每写一条断言，先问它在对应逻辑被改坏时会不会失败。** 关键路径（TG 分流、原生渲染分支、删除确认）必须做变异验证——把逻辑改坏、确认对应测试真的变红、再还原——并在交付证据里写明。

## 7. 不在本 spec 范围

- **英文侧**（`EP-fs-en`）：两道机械反幻觉校验目前仅中文有效、`buildFengshuiSystemPrompt("en")` 仍是中文指令加一句英文、英文页面的确定性内容基本还是中文。独立排期。
- 玄空飞星（Layer 2）、物件级化解。
