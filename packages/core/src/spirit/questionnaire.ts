/**
 * 心理自陈问卷（EP-profile-q，最小版）。
 * 反思性、非临床、成长导向；与命盘「客观」并置为「主观自我认知」，喂给本命之灵的上下文。
 * 答案不参与排盘，只作灵的对话/画像参考。
 */

export type QuestionnaireItem = {
  id: string;
  prompt: string;
  options: { value: string; label: string }[];
};

export type QuestionnaireAnswers = Record<string, string>;

export const PROFILE_QUESTIONNAIRE: QuestionnaireItem[] = [
  {
    id: "energy",
    prompt: "After a demanding week, what restores you most?",
    options: [
      { value: "solitude", label: "Solitude and quiet" },
      { value: "people", label: "Time with people I love" },
      { value: "doing", label: "Making or doing something" },
      { value: "rest", label: "Open-ended, unstructured rest" },
    ],
  },
  {
    id: "decision",
    prompt: "When facing a hard choice, what do you most trust?",
    options: [
      { value: "gut", label: "My gut feeling" },
      { value: "analysis", label: "Careful analysis" },
      { value: "counsel", label: "Counsel from people I trust" },
      { value: "values", label: "What aligns with my values" },
    ],
  },
  {
    id: "stress",
    prompt: "Under real pressure, you tend to…",
    options: [
      { value: "push", label: "Push harder" },
      { value: "withdraw", label: "Withdraw to think" },
      { value: "connect", label: "Reach out for connection" },
      { value: "defer", label: "Distract and defer" },
    ],
  },
  {
    id: "growth",
    prompt: "Right now, you most want to grow in…",
    options: [
      { value: "relationships", label: "Relationships" },
      { value: "purpose", label: "Work and purpose" },
      { value: "peace", label: "Inner peace" },
      { value: "understanding", label: "Self-understanding" },
    ],
  },
  {
    id: "theme",
    prompt: "What feels most alive for you these days?",
    options: [
      { value: "transition", label: "A transition" },
      { value: "relationship", label: "A relationship" },
      { value: "creative", label: "A creative pursuit" },
      { value: "meaning", label: "A search for meaning" },
    ],
  },
];

/** 把答案渲染成给灵看的「自陈摘要」（仅含已答项，自然语言）。 */
export function formatQuestionnaire(answers: QuestionnaireAnswers): string {
  const lines: string[] = [];
  for (const item of PROFILE_QUESTIONNAIRE) {
    const v = answers[item.id];
    if (!v) continue;
    const opt = item.options.find((o) => o.value === v);
    if (opt) lines.push(`- ${item.prompt} → ${opt.label}`);
  }
  return lines.join("\n");
}
