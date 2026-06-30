"use client";

import { useState } from "react";
import { PROFILE_QUESTIONNAIRE, type QuestionnaireAnswers } from "@eamvp/core";
import { saveQuestionnaire, type Profile } from "@/lib/profiles";
import { hasTgSession, tgSaveQuestionnaire } from "@/lib/tg/client";
import { Card } from "@/components/ui";

export function Questionnaire({
  profile,
  onDone,
}: {
  profile: Profile;
  onDone: (a: QuestionnaireAnswers) => void;
}) {
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});
  const [saving, setSaving] = useState(false);

  const allAnswered = PROFILE_QUESTIONNAIRE.every((q) => answers[q.id]);

  const select = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleDone = async () => {
    if (!allAnswered) return;
    setSaving(true);
    try {
      if (hasTgSession()) {
        await tgSaveQuestionnaire(answers);
      } else {
        await saveQuestionnaire(profile.id, answers);
      }
      onDone(answers);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mb-6">
      <div className="mb-5">
        <h3 className="font-serif text-[17px] font-semibold">自我自陈 · A few questions</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          几道主观自陈题，让本命之灵更懂你的心境与倾向。答案没有对错，只用于深化对话与画像，不参与命盘排算。
        </p>
      </div>

      <div className="space-y-6">
        {PROFILE_QUESTIONNAIRE.map((q, idx) => (
          <fieldset key={q.id} className="min-w-0">
            <legend className="mb-3 text-[14px] leading-relaxed text-ink-2">
              <span className="mr-2 text-[12px] text-muted">{String(idx + 1).padStart(2, "0")}</span>
              {q.prompt}
            </legend>
            <div className="flex flex-wrap gap-2">
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => select(q.id, opt.value)}
                    className="rounded-[var(--radius-chip)] px-3.5 py-2 text-[13px] leading-snug transition-all duration-200"
                    style={{
                      background: selected ? "var(--color-cinnabar)" : "transparent",
                      color: selected ? "white" : "var(--color-ink-2)",
                      border: "1px solid",
                      borderColor: selected ? "var(--color-cinnabar)" : "var(--color-line)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        onClick={handleDone}
        disabled={!allAnswered || saving}
        className="mt-6 w-full rounded-[var(--radius-button)] px-5 py-3 text-[15px] font-medium text-white transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ background: "var(--color-cinnabar)" }}
      >
        {saving ? "保存中…" : "完成 · 让本命之灵更懂你"}
      </button>
    </Card>
  );
}
