"use client";

import { useEffect, useState } from "react";
import {
  adviseObject, OBJECT_CATEGORIES, CATEGORY_LABEL, DIRECTIONS, DIRECTION_LABEL,
  type FengshuiChart, type ObjectAdvice, type ObjectCategory, type Direction,
  type DirectionVerdict,
} from "@eamvp/core";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";
import { isTelegram } from "@/lib/tg/client";
import { useTgMainButton, haptics } from "@/lib/tg/ui";
import { Group } from "@/components/tg/native";
import { Card, Button } from "@/components/ui";

// 与 core `MATERIAL_ELEMENT`/`SHAPE_ELEMENT`（packages/core/src/fengshui/object-advisor.ts）
// 里登记的键保持字面一致——`adviseObject` 按这些中文字符串做字典查找来判断物件五行，
// 查不中就返回 null。即便 UI locale 切到英文，这里下拉框的 value 也必须仍是这些中文
// 键（value 与显示文本一并本地化会与 core 查表脱钩），所以本表不随 language 变化。
const MATERIALS = ["原木", "金属", "玻璃", "陶瓷", "皮革", "棉麻", "石材"];
const SHAPES = ["长条", "方", "圆", "尖锐", "波浪"];

const SELECT_CLASS = "w-full rounded-[var(--radius-button)] border border-line bg-surface px-3 py-2 text-[14px] text-ink";

/**
 * 物件顾问（EP-fs-08）。建议在客户端确定性算出；LLM 只润色成句，失败不影响可用性。
 *
 * `dwellingSectors`（EP-fs-18 强版，可选）：**宅卦**八方判语（`dwellingGua(facing).sectors`），
 * 与 `fs.personalDirections`（**命卦**八方）是两套，页面上不混用。不传 = 波1 弱版。
 *
 * ⚠️ **别把它读成「推荐位需同时是命卦吉方与宅卦吉方」**——这个说法曾写在这里，是错的，
 * 而且它描述的性质**永不可观察**。八宅里一个人的四吉方恰好就是他所在那一组（东四/
 * 西四）的四个方位，所以「命卦吉方 ∩ 宅卦吉方」只可能是 **4**（命宅同组）或 **0**
 * （异组），没有中间值：
 *   - 同组 → 交集 = 四吉方全中，与不传逐字节相同；
 *   - 异组 → 交集为空，core 刻意退回**命卦**吉方（人比房子要紧），而那几个方位恰恰
 *     **不是**宅卦吉方。
 * 结论：`adviseObject` 里 `usable ≡ good`，**传与不传算出的 `recommendedDirections`
 * 在任何输入下都逐字节相同**（评审枚举 276,480 组入参实测）。强版唯一多出来的可观察
 * 内容是 **`dwellingNote`**，且只在异组时非 null。任何想在 DOM 上分辨强弱版的断言都
 * 不可证伪，只能断言 `adviseObject` 的**入参**或 `dwellingNote`——测试文件里已按此写。
 *
 * 传不传由调用方（`object/page.tsx`）按「已确认会员资格 + 确实有朝向已知的居所」
 * 决定，本组件不做闸门判断，只忠实透传。
 */
export function ObjectAdvisorForm({
  fs,
  dwellingSectors,
}: {
  fs: FengshuiChart;
  dwellingSectors?: Record<Direction, DirectionVerdict>;
}) {
  const t = useT();
  const { locale } = useLocale();
  const [category, setCategory] = useState<ObjectCategory>("desk");
  const [material, setMaterial] = useState("");
  const [shape, setShape] = useState("");
  const [dir, setDir] = useState<Direction | "">("");
  const [advice, setAdvice] = useState<ObjectAdvice | null>(null);
  const [prose, setProse] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // EP-fs-tg：TG 内提交走原生 MainButton（页内按钮隐藏），表单项套原生分组观感；
  // web 路径保持页内按钮不变。
  const inTg = mounted && isTelegram();

  useTgMainButton({
    text: t("fengshui.object.submit"),
    onClick: () => submit(),
    visible: inTg,
  });

  function submit() {
    haptics.light();
    const a = adviseObject(
      { verdicts: fs.personalDirections, affinity: fs.elementAffinity, dwellingSectors },
      {
        category,
        material: material || undefined,
        shape: shape || undefined,
        intendedDirection: dir || undefined,
      },
    );
    setAdvice(a);
    setProse(null);
    fetch("/api/fengshui/object", {
      method: "POST",
      headers: { "content-type": "application/json", "x-zj-locale": locale },
      body: JSON.stringify(a),
    })
      .then(async (r) => { if (r.ok) setProse(await r.text()); })
      .catch(() => { /* 确定性结果已足够，静默 */ });
  }

  const fields = (
    <>
      <Field label={t("fengshui.object.category")} id="fs-cat">
        <select id="fs-cat" value={category} onChange={(e) => setCategory(e.target.value as ObjectCategory)} className={SELECT_CLASS}>
          {OBJECT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
      </Field>
      <Field label={t("fengshui.object.material")} id="fs-mat">
        <select id="fs-mat" value={material} onChange={(e) => setMaterial(e.target.value)} className={SELECT_CLASS}>
          <option value="">{t("fengshui.object.unspecified")}</option>
          {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <Field label={t("fengshui.object.shape")} id="fs-shape">
        <select id="fs-shape" value={shape} onChange={(e) => setShape(e.target.value)} className={SELECT_CLASS}>
          <option value="">{t("fengshui.object.unspecified")}</option>
          {SHAPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label={t("fengshui.object.intendedDirection")} id="fs-dir">
        <select id="fs-dir" value={dir} onChange={(e) => setDir(e.target.value as Direction | "")} className={SELECT_CLASS}>
          <option value="">{t("fengshui.object.unspecified")}</option>
          {DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
        </select>
      </Field>
    </>
  );

  return (
    <div>
      {inTg ? (
        // TG：表单项套原生分组观感（Group 自带分隔线），提交由 MainButton 承担。
        <Group>
          <div className="flex flex-col gap-3 px-[14px] py-[12px]">{fields}</div>
        </Group>
      ) : (
        <div className="flex flex-col gap-3">
          {fields}
          <Button onClick={submit} className="mt-1">{t("fengshui.object.submit")}</Button>
        </div>
      )}

      {advice && (
        <Card className="mt-6 p-4">
          {/* 命卦吉方与宅卦吉方交集为空时，core 会退回命卦吉方并把原因写进
              `dwellingNote`。放在卡片最顶上：它解释的是「下面这些推荐位是怎么来的」，
              读者得先看到这句才不会把「推荐位对这套房子并不吉」当成算错。
              正文直接取 `advice.dwellingNote`（引擎结论），不在 web 层另写一份。
              ⚠️ 它必须排在下面那句 LLM 润色文案**之前**：`packages/llm/.../prompt.ts`
              明确告诉模型这条提示「已原样展示在你这段话上方」，顺序一换，提示词就是在
              对模型说假话。顺序由 ObjectAdvisorForm.test.tsx 的一条 DOM 顺序断言守着。 */}
          {advice.dwellingNote && (
            <div className="mb-3 p-3" style={{ borderRadius: "var(--radius-card)", background: "var(--color-tint)" }}>
              <h3 className="text-[13px] text-ink">{t("fengshui.object.dwellingNoteTitle")}</h3>
              <p className="mt-1 text-[13px] text-ink-2">{advice.dwellingNote}</p>
            </div>
          )}
          {prose && <p className="mb-3 text-[15px] text-ink">{prose}</p>}
          <p className="text-[13px] text-muted">
            {t("fengshui.object.elementOf")}：{advice.elementOfObject ?? "—"}
          </p>
          <h3 className="mt-3 text-[14px]">{t("fengshui.object.recommended")}</h3>
          <ul className="mt-1 text-[14px] text-ink-2">
            {advice.recommendedDirections.map((r) => <li key={r.direction}>{r.label}｜{r.reason}</li>)}
          </ul>
          <h3 className="mt-3 text-[14px]">{t("fengshui.object.avoid")}</h3>
          <ul className="mt-1 text-[14px] text-ink-2">
            {advice.avoid.map((r) => <li key={r.direction}>{r.label}｜{r.reason}</li>)}
          </ul>
          <h3 className="mt-3 text-[14px]">{t("fengshui.object.rules")}</h3>
          <ul className="mt-1 text-[14px] text-ink-2">
            {advice.categoryRules.map((r) => <li key={r}>{r}</li>)}
          </ul>
          <h3 className="mt-3 text-[14px]">{t("fengshui.object.fit")}</h3>
          <p className="mt-1 text-[14px] text-ink-2">{advice.personalFit}</p>
          {advice.intendedVerdict && (
            <>
              <h3 className="mt-3 text-[14px]">{t("fengshui.object.intended")}</h3>
              <p className="mt-1 text-[14px] text-ink-2">
                {DIRECTION_LABEL[advice.intendedVerdict.direction]}｜{advice.intendedVerdict.star}
                （{advice.intendedVerdict.auspicious ? "吉" : "凶"}）
              </p>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-[13px] text-ink-2">
      {label}
      {children}
    </label>
  );
}
