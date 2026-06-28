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
    prompt: "在高强度的一周之后，什么最能让你恢复？",
    options: [
      { value: "solitude", label: "独处与安静" },
      { value: "people", label: "与所爱之人相处" },
      { value: "doing", label: "动手做点什么" },
      { value: "rest", label: "无所事事地休息" },
    ],
  },
  {
    id: "decision",
    prompt: "面对艰难的抉择，你最信任什么？",
    options: [
      { value: "gut", label: "我的直觉" },
      { value: "analysis", label: "审慎的分析" },
      { value: "counsel", label: "信任之人的建议" },
      { value: "values", label: "与价值观相符" },
    ],
  },
  {
    id: "stress",
    prompt: "真正的压力之下，你倾向于…",
    options: [
      { value: "push", label: "更用力地推进" },
      { value: "withdraw", label: "退回内在思考" },
      { value: "connect", label: "向外寻求联结" },
      { value: "defer", label: "分心、拖延" },
    ],
  },
  {
    id: "growth",
    prompt: "此刻，你最想在哪一面成长？",
    options: [
      { value: "relationships", label: "关系" },
      { value: "purpose", label: "事业与志业" },
      { value: "peace", label: "内在的平静" },
      { value: "understanding", label: "自我理解" },
    ],
  },
  {
    id: "theme",
    prompt: "这些日子里，什么对你最鲜活？",
    options: [
      { value: "transition", label: "一段过渡" },
      { value: "relationship", label: "一段关系" },
      { value: "creative", label: "一项创造" },
      { value: "meaning", label: "对意义的追寻" },
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
