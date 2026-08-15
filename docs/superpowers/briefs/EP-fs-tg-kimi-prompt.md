# EP-fs-tg — Worker Brief（给 kimi 席位）

> 直接把本文件路径给 kimi，或整段粘贴。它是自足的：假设你没有此前风水两波开发的任何上下文。

---

## 0. 你是谁、在哪个协议里

你是 pact 协议的 **worker 席位 `kimi`**。本任务的 **reviewer 是 `claude`**。

pact 两条硬规则：
1. **worker 不能自验收**——只有 reviewer 能 accept
2. feature 的全部 task 未 accept 前不得 merge

所以：**你不要合并到 main，不要自行宣布完成。** 干完打 checkpoint（见 §7 交付契约），claude 来验收。

先读：仓库根的 `AGENTS.md`（你的席位入口）与 `CLAUDE.md`（项目上下文与命令）。

## 1. 任务

把**风水「境」功能**做 Telegram 适配。设计文档（**先完整读一遍，它是需求的唯一事实源**）：

```
docs/superpowers/specs/2026-08-15-fengshui-telegram-adaptation.md
```

本 brief 只补 spec 里没有的：代码坐标、参照范式、已知陷阱、交付契约。**需求以 spec 为准，两者冲突时问 claude，不要自行取舍。**

## 2. 前置条件（重要，别跳）

风水波 2（Layer 1 住宅实盘）**此刻还没合并**。你要改的四个界面里有两个（`dwellings/page.tsx`、`DwellingForm.tsx`）就是波 2 的产物。

**在 claude 通知你「波 2 已合并 main」之前不要开工。** 收到通知后：

```bash
git checkout main && git pull
git checkout -b feat/fengshui-tg
pnpm install
```

以 `main` 最新为基线。**不要**从 `feat/fengshui-wave2` 分支出来。

## 3. 代码坐标（已核实，2026-08-15）

### 要改的四个界面
```
apps/web/app/fengshui/page.tsx              境页（Tab: chart/remedy/object）
apps/web/app/fengshui/object/page.tsx       物件顾问页
apps/web/app/fengshui/dwellings/page.tsx    居所管理页
apps/web/app/fengshui/DwellingForm.tsx      居所表单（被 dwellings 页用）
apps/web/app/fengshui/ObjectAdvisorForm.tsx 物件表单
apps/web/components/charts/BaguaWheel.tsx   八方盘 SVG（本次基本不用动）
```
这四个界面**已经**引用了 `@/lib/tg/client` 的 `hasTgSession`/`tgGetProfile`（档案读取那条路已通），但**零引用** `@/components/tg/*`——这就是要补的。

### 数据层（要加 TG 分支）
```
apps/web/lib/dwellings.ts         居所 CRUD，目前只有 Supabase 匿名客户端一条路
apps/web/lib/fengshui-report.ts   报告读写 + fengshuiFingerprint()
```

### 要新建
```
apps/web/app/api/tg/fengshui/…    形态你定（单 route 带 action，或拆子路由）
```

### 现有 web 侧 API（TG 侧要复用其业务逻辑，别重写解读层）
```
apps/web/app/api/fengshui/reading/route.ts
apps/web/app/api/fengshui/object/route.ts
```

## 4. 照抄这三个既有范式（不要另起炉灶）

| 你要做的 | 照抄哪里 |
|---|---|
| TG 后端鉴权 | `apps/web/app/api/tg/spirit/route.ts` — `cookies()` 取 `TG_COOKIE` → `readSession` → 未登录 401 → `getProfileForUser(s.uid)` → `localeFromRequest(req)` |
| 前端 TG/web 分支 + 原生列表 | `apps/web/app/profiles/page.tsx` — `const inTg = mounted && isTelegram()`，TG 分支渲染 `<Group>`/`<Cell>` |
| 页内两步删除确认 | 同上 `profiles/page.tsx` 的 `confirmDeleteId` 状态机（约 117/150-155 行一带，TG 与 web 两个分支都实现了） |

可用原语：
- `apps/web/components/tg/native.tsx` — `Section` / `Group` / `Cell` / `Bubble`
- `apps/web/lib/tg/ui.ts` — `useTgMainButton({text,onClick,enabled?,visible?})` / `useTgBackButton` / `haptics.{light,medium,success}`
- `apps/web/lib/tg/client.ts` — `isTelegram()` / `hasTgSession()`，以及 `tgListProfiles`/`tgDeleteProfile` 这类客户端封装的写法参考

## 5. 硬约束

1. **改动范围只限 `apps/web`。** 不动 `packages/core`、`packages/llm`、数据库、任何非风水页面。
2. **非 TG（普通浏览器）路径行为零变化。** 这是既有两轮 TG 原生化都守的线，也是验收重点。
3. **全程 `NEXT_PUBLIC_FENGSHUI_ENABLED` 门控**，默认关闭。flag 关闭时导航无「境」、`/fengshui` 不可达。
4. **服务端独立校验。** 客户端传来的 uid / 档案 id / 居所 id 一律不可信，后端自己从 session 解 uid 并校验归属。
5. **颜色走 CSS 令牌**（`var(--color-*)`），不要硬编码色值——项目在 TG 暗色主题上专门栽过一次。
6. **`api/tg/fengshui` 的错误码与既有 `api/tg/*` 一致**：未登录 401、入参非法 400、LLM 未配置 503、生成失败 500。

## 6. 已知陷阱（本项目真踩过，逐条看）

1. **中文方位名互相嵌套**：`北` 是 `东北` 的子串，`东`/`南`/`西` 同理。任何按方位名做的字符串匹配或测试查询**必须精确匹配**（正则锚定 `^…$`，testing-library 用 `{ exact: true }` 或 `getByRole` 带精确 name）。这个坑在本项目已经咬过**三次**。
2. **`vi.resetModules()` + 动态 import 页面时，`I18nProvider` 必须在同一处动态 import**，否则拿到两份不同的 Context 实例、`useT` 抛错。波 1 波 2 都踩过。
3. **`Array.prototype.sort` 原地排序**：排序前 `[...arr]` 复制。波 1 曾因此永久打乱调用方数组。
4. **Web 端口固定 3030**（3000 被本机其他进程长期占用），见 `CLAUDE.md`。
5. `apps/web` 的 tsconfig **覆盖**测试文件（core 的 `test/` 不覆盖），所以你写在 web 测试里的类型断言是有效的。

## 7. 测试纪律（本项目的硬要求，验收会逐条查）

风水前两波累计出现 **8 次**「断言抓不到它声称要防的 bug」。真实例子：

- `expect(f(f(x))).toBe(x)`——对恒等函数同样成立，抓不到「坐向没取对宫」
- `expect(dirs.length).toBeGreaterThan(0)`——领域上恒为 4，`DIRECTIONS.slice(0,4)` 这种明显错误照样全绿
- `expect(out).not.toContain("宅卦")`——实现根本不会输出这个字符串，断言恒真
- 多选功能 5 条测试全都只点了一个人 → 把 `toggle` 改成单选，12 条测试全绿

**要求：每写一条断言，先问自己「对应逻辑被改坏时，这条会不会红？」**

关键路径**必须做变异验证**——把逻辑改坏、跑测试确认真的变红、再还原。至少覆盖这三处：

| 变异 | 期望 |
|---|---|
| 把数据层的 TG 分支判断改成恒 false（永远走 web 路径） | TG 分流相关测试变红 |
| 把 `inTg` 改成恒 false（永远渲染 web UI） | 原生渲染分支测试变红 |
| 把两步确认改成点一下直接删 | 删除确认测试变红 |

**变异验证的结果要写进交付证据**：改了什么、哪几条测试变红、还原后全绿。

## 8. 交付契约

### 完成前自查
```bash
pnpm --filter @eamvp/web test     # 全绿（当前基线 117 条 + 你新增的）
pnpm typecheck                    # 全 monorepo，exit 0
pnpm --filter @eamvp/web build    # 通过
```

### 提交
- 分支 `feat/fengshui-tg`，**不要合并 main**
- commit message 带 `[EP-fs-tg]` 前缀
- 频繁小提交优于一个大提交

### 交给 claude 验收时要给的证据
1. **改了哪些文件**，每个文件一句话说明改了什么
2. **三条命令的实际输出**（测试条数、typecheck、build）
3. **§7 的变异验证记录**——三个变异各自改了什么、哪几条测试变红、还原确认
4. **TG 内实测**（能做则做）：居所增删改查、报告生成与持久化在 TG 会话下确实工作了——这三件事在改之前是**不工作**的，是本任务的实质价值所在
5. **非 TG 回归**：普通浏览器路径行为无变化，你是怎么确认的
6. **你的疑虑**：哪里你不确定、哪里你做了取舍、哪里 spec 没说清你自己定了

### 遇到这些情况停下来问 claude，不要自行决定
- spec 与本 brief 冲突
- 需要改 `apps/web` 之外的东西
- 需要动数据库 schema
- 发现 spec 里的事实判断是错的（欢迎——前两波的严重错误都是这样发现的）

---

**一句话总结任务价值**：风水在 TG 里现在是「网页塞进 webview」，而且**居所与报告持久化实际不工作**。你要让它既像 TG 原生应用，又真的能用。
