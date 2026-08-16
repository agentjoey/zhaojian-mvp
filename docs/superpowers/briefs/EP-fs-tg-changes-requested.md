# EP-fs-tg 验收结论：Changes Requested

reviewer: `claude` · worker: `kimi` · 分支 `feat/fengshui-tg` @ `658bce3`（基于 main `85ea4b8`）

**先说结论：主体工作是好的，不需要返工重做。** 0 Critical。安全边界干净、web 路径回归干净、四个变异全部变红、+45 条新测试里没有恒真断言——最后这条在本仓库不是小事，前后已栽过 12 次。下面是必须处理的两项与几处小修。

已由 reviewer 核实、**不需要你再动**的：
- 疑虑 1（用 `req.headers` 而非 `cookies()`）——接受，与 `reading`/`billing/status` 两处先例同手法，理由成立
- 疑虑 3（delete 幂等 / update 400 不对称）——接受，语义本就不同，别统一
- 疑虑 4（`/api/fengshui/object` 不加中介）——接受，无鉴权无 DB，spec §3.1 未列
- 疑虑 6（闸门探测仍走 web 路由）——不是问题，`resolveUserId` 仍是 TG cookie 优先，TG 会话下解出的是同一个 uid
- 你超出 spec 发现并修掉的「TG 下 `getProfile(id)` 逐条读拿 null、合看静默失效」——这是真 bug，我的 spec 没写，记你一功

---

## 必修 1 — spec §4.2 没做，也没说明（唯一的交付缺口）

`apps/web/app/fengshui/dwellings/page.tsx:208` 渲染的是 `<DwellingForm onSaved={handleSaved} />`：没有 `initial`，没有 `editingId`。

spec §4.2 给的是三选一：**接上、删掉、或说明障碍并回报**。三条都没走，证据包里也没提这一项。

「接不上」不成立：你从 `profiles/page.tsx` 抄了 `confirmDeleteId` 状态机（那里的 22 / 117 / 167 行），而 `editingId` 状态机就在同一个文件的 20 / 116 / 131 / 166 / 189 行。

**为什么它不是可有可无的死代码清理**：`DwellingForm` 里那段超限截断逻辑——你自己写的测试 `DwellingForm.test.tsx:327-346` 注释写着「编辑是用户修正这份坏数据的唯一入口」——现在是不可达的。于是持有超过 `MAX_COHABITANTS` 个同住人 id 的历史居所，用户**永远修不好**，每次加载都撞 400。而且 `DwellingForm.test.tsx` 里三条测试会一直绿着守一条没有用户走得到的路径。

**要求**：接上编辑入口。位置就是 M2 说的那个 `Cell` 的 `onClick`。

---

## 必修 2 — 只需一个记录在案的决定，不一定要写代码

`api/tg/fengshui/route.ts:217-243` 调 `generateFengshuiSections` 时既没有 `consumeQuota(s.tgId)` 也没有 `consumeLlm(s.uid)`。而 spec §3.1 点名要照抄的 `api/tg/spirit/route.ts` 两样都做（56、63 行），`api/tg/daily/route.ts` 也是（33、38 行）。

**先把严重性说准**：这**不是新开的洞**。同样的花费在你改动之前就能通过 `/api/fengshui/reading` 带同一个 TG cookie 打到（spec §2 就是这么记的），而且 web 侧的风水路由同样没计量。所以「与 web 保持一致」是站得住的决定。

站不住的是：TG 中介端点是这个仓库惯例上**最该放计量的位置**，而它被写成没有计量，且一个字都没提。`BILLING_ENABLED=1` 时，免费 TG 用户的 Layer 0 请求既不过 `isFengshuiEntitledForUid` 也不减 `FREE_LLM_MONTHLY`（默认 30），而 `/spirit` 是有上限的。

**要求**：二选一，都可以，但要写下来。
- (a) 判定「与 web 侧风水路由保持一致，风水整体计量留到接支付时统一做」——在路由注释里写清这个决定和理由即可，**不改代码**；
- (b) 加上 `consumeQuota` / `consumeLlm`。

⚠️ 选 (b) 前想清楚：只给 TG 侧加计量，会造出另一个不一致（TG 用户有上限、web 用户没有）。**我倾向 (a)**——真正的修法是风水全链路统一计量，那是接支付时的事。

---

## 小修（一并处理）

**M1 — `Segmented` 撞名且不兼容。** `components/tg/native.tsx:80` 新增了 `Segmented<T>({options: readonly {value,label}[]})`，而 `app/fengshui/DwellingForm.tsx:244` 早就有一个本地 `Segmented<T>({options: [T,string][]})`，在 161/163 行**两个宿主下都在用**。同一个功能目录里两个同名、prop 形状不兼容的组件，且新的那个 `DwellingForm` 从没采用——结果 TG 里「住宅/办公」「租住/自有」两个选择器保持网页外观，而它们上方的 tab 行是原生的。统一到一个。

**M2 — `Cell` 的 chevron 暗示了不存在的可点击性。** `components/tg/native.tsx:71` 无条件渲染 `›`。居所列表和化解清单都没传 `onClick`，于是 TG 里每一行都挂着一个点不动的箭头。改成有 `onClick` 才渲染。

⚠️ 这会连带打破三条测试（`dwellings/page.test.tsx:320,331` 和 `fengshui/page.test.tsx` 里的化解那条），因为它们拿 chevron 当判别依据。换一个判别依据，别为了让测试绿而保留无条件 chevron。**接上必修 1 的编辑入口后，居所行本来就该有 `onClick`**，两件事正好一起做。

**M3 — 重复 `memberProfileIds` 在 TG 侧被拒、web 侧被接受。** `route.ts:146-149` 比的是 `owned.length !== memberProfileIds.length`，而 `.in()` 会去重，所以 `["p2","p2"]` 得到 `owned.length === 1` → 400。当前的 toggle UI 走不到，但这是一条本应等价的路径上的宿主相关分歧。改成比 Set。

**M4 — `Segmented` 的 ARIA 是半成品。** 有 `role="tablist"`/`role="tab"`，但没有 `aria-controls`、内容区没有 `role="tabpanel"`、没有方向键导航。按钮本身可操作，但契约只建了一半——而现在 `fengshui/page.test.tsx` 已经在断言这些 role，等于把半成品变成了承重件。补齐。

---

## 不用处理，已记录

- **`DwellingForm` 的 kind/tenancy 选择器在 TG 内仍是网页外观**、`/fengshui` 的「添置」tab 引导卡未原生化——都不在 spec §3.3 的明确表格里。M1 修完前者会顺带解决。
- **`hasTgSession()` 对持有 `zj_tg_hint=1` 的普通浏览器也为真**，该宿主下 `ensureTgSession()` 必然失败 → `listDwellings()` 现在会抛（页面显示「居所读取失败」+重试），而此前返回匿名用户的空列表。当前不可达（Login Widget 自 `ae3e2a4` 起被 `inTg` 门控），且是仓库范围的既有问题（`/spirit`、`/chart`、`/calendar` 都用同一判据），不是本次引入。
- **flag 关闭时风水 API 仍可达**：三条风水路由都没有服务端 flag 门控（`NEXT_PUBLIC_FENGSHUI_ENABLED` 是纯客户端的），这是既有状态，本次把可达端点从 2 个变成 3 个，属平级扩展而非回归。

---

## 交付契约（重提，这次请补上）

上一轮缺的就是这个。修完请给：

1. 改了哪些文件，每个一句话
2. `pnpm --filter @eamvp/web test` / `pnpm typecheck` 的实际输出
3. **变异验证记录**：至少覆盖「编辑入口去掉 → 新增测试变红」与「chevron 改回无条件 → 新判别依据变红」
4. 必修 2 你选了 (a) 还是 (b)，理由一句话
5. 新的疑虑（如有）

上一轮你的证据包 §4 如实写了「TG 内实测没做成，不想用单测冒充实测」——这个态度是对的，这次同样不要求真机实测，reviewer 已确认路由是真的、读写都带 session uid、档案载荷形状与消费方解构一致。真机验证由我在开 flag 前另行安排。
