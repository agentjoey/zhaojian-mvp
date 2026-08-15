"use client";

import { useState } from "react";
import {
  adviseObject, OBJECT_CATEGORIES, CATEGORY_LABEL, DIRECTIONS, DIRECTION_LABEL,
  type FengshuiChart, type ObjectAdvice, type ObjectCategory, type Direction,
} from "@eamvp/core";
import { useT, useLocale } from "@/lib/i18n/I18nProvider";
import { Card, Button } from "@/components/ui";

// 与 core `MATERIAL_ELEMENT`/`SHAPE_ELEMENT`（packages/core/src/fengshui/object-advisor.ts）
// 里登记的键保持字面一致——`adviseObject` 按这些中文字符串做字典查找来判断物件五行，
// 查不中就返回 null。即便 UI locale 切到英文，这里下拉框的 value 也必须仍是这些中文
// 键（value 与显示文本一并本地化会与 core 查表脱钩），所以本表不随 language 变化。
const MATERIALS = ["原木", "金属", "玻璃", "陶瓷", "皮革", "棉麻", "石材"];
const SHAPES = ["长条", "方", "圆", "尖锐", "波浪"];

const SELECT_CLASS = "w-full rounded-[var(--radius-button)] border border-line bg-surface px-3 py-2 text-[14px] text-ink";

/** 物件顾问（EP-fs-08）。建议在客户端确定性算出；LLM 只润色成句，失败不影响可用性。 */
export function ObjectAdvisorForm({ fs }: { fs: FengshuiChart }) {
  const t = useT();
  const { locale } = useLocale();
  const [category, setCategory] = useState<ObjectCategory>("desk");
  const [material, setMaterial] = useState("");
  const [shape, setShape] = useState("");
  const [dir, setDir] = useState<Direction | "">("");
  const [advice, setAdvice] = useState<ObjectAdvice | null>(null);
  const [prose, setProse] = useState<string | null>(null);

  function submit() {
    const a = adviseObject(
      { verdicts: fs.personalDirections, affinity: fs.elementAffinity },
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

  return (
    <div>
      <div className="flex flex-col gap-3">
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
        <Button onClick={submit} className="mt-1">{t("fengshui.object.submit")}</Button>
      </div>

      {advice && (
        <Card className="mt-6 p-4">
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
