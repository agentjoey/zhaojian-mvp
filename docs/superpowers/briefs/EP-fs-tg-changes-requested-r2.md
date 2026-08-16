# EP-fs-tg 复验结论（第 2 轮）：Changes Requested

reviewer: `claude` · worker: `kimi` · 分支 `feat/fengshui-tg` @ `8109af2`

**六项必修/小修全部真正落地了，判别力也过关**——复审跑了九个变异（我指定四个 + 它自己加五个）**全部变红**，并且**没有找到一条恒真断言**。这个仓库前后栽过 12 次的地方，连续两轮守住了。

复审逐条确认的：必修1 端到端真的通（`updateDwelling("d1", {facing:"N"})` 而非 `createDwelling`，保存后回新增态；去掉 `key=` → 3 红，说明重挂载守卫是承重的）；必修2 决定记录得当；M2 的判别依据是**真的换了**而不是削弱（`getNodeText` 只拼直接子文本节点，所以 TG 的单 `<span>` 匹配得上、web 的三个兄弟 `<span>` 匹配不上，强制 `inTg=false` 会红）；M3 变异回长度比较 → 1 红。

剩两项，都不大。

---

## 必修 A — M4 的 ARIA 修复漏到了 web 路径上，反而把 web 的无障碍改坏了

`apps/web/app/fengshui/page.tsx:551`、`:713`、`:788`

三处 `role="tabpanel" / id / aria-labelledby` 写在了 `inTg` 条件**之外**——只有 `:521-548` 的 tab 行被门控了。复审直接探了渲染后的 web DOM：

```
PROBE web tabpanels: 1  fs-panel-chart | labelledby=fs-tab-chart | target=MISSING
                     | tabs on web: 0
```

也就是说普通 web 上现在有一个 `role="tabpanel"`，**没有 tablist、没有 tab，`aria-labelledby` 指向一个在任何状态下都不存在的 id**。屏幕阅读器用户进到命盘区域会听到「tab panel」却没有名字、也没有所属的 tab 列表；`aria-labelledby` 指向不存在的元素是 axe 的 `aria-valid-attr-value` 失败项，任何无障碍审计都会亮红。

这一条同时踩了两件事：spec §6 的「非 TG web 路径行为零变化」是本次的硬约束；而上一轮复审专门表扬过 web 路径的干净。**一个为改善无障碍而做的修复，把 web 的无障碍改坏了**——这正是「只在被改的那一侧验证」会漏掉的形状。

web 对照测试（`page.test.tsx:1421-1428`）只断言了 `queryByRole("tablist")` 为 null，所以抓不到。

**要求**：三处属性都按 `inTg` 门控，例如
```tsx
{...(inTg ? { role: "tabpanel", id: "fs-panel-chart", "aria-labelledby": "fs-tab-chart" } : {})}
```
TG 侧测试不受影响（它们设 `inTg=true`）。**同时给 web 对照测试补一条** `expect(screen.queryAllByRole("tabpanel")).toHaveLength(0)`，否则这条还会回来。

**附带**：`:550-551` 把命盘面板从 `<>` 改成了裸 `<div>`，**两个宿主都改了**。布局风险低（`<main>` 是常规块流，没有 `space-y-*` / `[&>*+*]` 兄弟选择器，外边距会塌陷），但仍是一处不必要的 web DOM 改动。门控属性时顺手决定：`<div>` 保持无条件，或一并门控，你定。

---

## 必修 B — M1 的 TG 分支零覆盖，变异实证

`apps/web/app/fengshui/DwellingForm.tsx:162-193`

复审把 TG 两个选择器的 `onChange` 双双改成空函数（即 TG 里「住宅/办公」「租住/自有」全部失灵），**整套 233 条测试仍然全绿**。grep 也印证了：没有任何测试把 `kindHome`/`kindOffice`/`tenancyRent`/`tenancyOwn` 当作控件操作过；唯一那条 tenancy 测试（`DwellingForm.test.tsx:120-127`）只断言默认值 `"rent"`、从不点击，而且跑在 web 模式下。

代码本身是对的（复审读过，`TgSegmented` 的 `onChange(o.value)` 与 `OptionButtons` 等价）。问题是 M1 **改变了某个宿主下渲染的是哪个组件**，而这个组件两个宿主都渲染——正是上一轮点名的最高回归风险位置，spec §6 要求宿主分支渲染必须有变异验证过的覆盖。

失败场景：共享 `Segmented` 日后任何 prop 形状漂移（它现在已有两种模式，还会再长），会静默弄坏 Telegram 里的住宅↔办公，而所有测试保持全绿。

**要求**：在既有 `DwellingForm.test.tsx` 的 TG describe 里加一条——点「办公」、保存、断言 `createDwelling` 收到 `kind: "office"`。并确认它在上述变异下会红。

---

## 顺手修的两处

- **M-a** `lib/i18n/messages/zh.ts:403`、`en.ts:390`：`editTitle` 在 6 空格的块里缩进了 4 空格。
- **M-b** `dwellings/page.tsx:190-196`、`:234`：进入编辑态时被替换的表单区在页面更下方，既没有 `scrollIntoView`，被点的那一行也没有选中态。居所超过两套时表单在首屏之外，**TG 里点 Cell 看起来像没反应**。测试用 `getByDisplayValue`，它对视口无感，所以整套测试看不见这件事。

---

## 不用处理，已记录

- **M-c** `components/tg/native.tsx:52-58`：`Cell` 的 `onClick` 挂在 `<div>` 上，没有 `role="button"`、`tabIndex` 或键盘处理，所以 TG 的编辑入口是纯指针的。这是**仓库既有模式**（`app/page.tsx:148`、`profiles/page.tsx:125`），不是本次引入；web 侧编辑是真 `<button>`，键盘用户不受影响；TG Mini App 是触屏场景。记录，不要求本轮改。
- **M-d** `native.tsx:144`：组模式用 `role="group"` + `aria-pressed`（切换按钮语义）表达互斥选项，规范映射应是 `radiogroup`/`radio` + `aria-checked`。不算错，只是弱一些。
- **你的新疑虑 1（组模式无可见标题）**：结论对，但理由不成立——标题放在 `inTg ? … : …` 的 TG 臂里，web 上根本不会渲染，「web 零变化」这条红线其实没挡着。不过它也不是回归（改动前的 TG 分支同样没有标题），`aria-label` 已覆盖辅助技术。按现状合并即可。
- **你的新疑虑 2（MainButton 文案）**：不用改，「编辑居所」标题加预填字段已经承载了模式区分。
- **你的新疑虑 3（`aria-controls` 指向未挂载面板）**：接受，不用改。实现用的是**自动激活**（方向键同时选中并移焦），所以获焦 tab 的面板总是挂载的，悬空的只有非获焦 tab，辅助技术的交互到不了那里。但注意它在 web 上的镜像正是必修 A——那边是**在任何状态下**都悬空。修完必修 A，这条的残余暴露可忽略。

---

## 交付契约

```bash
pnpm --filter @eamvp/web test     # 基线 233
pnpm typecheck                    # exit 0
```

变异验证两条：
1. 把三处 tabpanel 属性改回无条件渲染 → web 对照测试新增的那条断言变红
2. 把 TG 两个选择器的 `onChange` 改成空函数 → 必修 B 新增的测试变红

两条都要实跑、观察变红、还原。
