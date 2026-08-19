import type { ReadingLanguage } from "./prompt";

/**
 * 解梦后置机械扫描（EP-dream-01）——与 sanitizeFengshui 同层：确定性兜底，不依赖模型自觉。
 * 规则：段落命中预言措辞词表 且 同段无诚实标注标记 → 逐句剥离命中句；有标注 → 保留。
 * 中英双词表从第一天做起（fengshui 英文侧机械校验失效是已记账的债，不抄）。
 */

/** 预言措辞：断言未来/吉凶定性。词表扩充时注意——长词在前（「预示着」⊃「预示」靠 some 命中，顺序无害，但剥离以句为单位）。 */
const PREDICTION_ZH = ["预示着", "预示", "将会", "凶兆", "吉兆", "主灾", "主吉", "血光", "大难临头", "必有"];
const PREDICTION_EN = ["foretell", "an omen", "omen of", "will come true", "means you will", "a sign that you will", "predicts"];

/** 诚实标注标记（段级存在性判定）。 */
const MARKER_ZH = ["民间说法", "传统上", "传统说法", "古人认为", "周公解梦", "民俗"];
const MARKER_EN = ["folk", "traditionally", "traditional interpretation", "cultural reference"];

const SENTENCE_RE = /[^。！？!?….\n]+[。！？!?….]*/g;

export function sanitizeDream(text: string, language: ReadingLanguage): { text: string; stripped: string[] } {
  const zh = language === "zh";
  const predictions = zh ? PREDICTION_ZH : PREDICTION_EN;
  const markers = zh ? MARKER_ZH : MARKER_EN;
  const stripped: string[] = [];

  const paras = text.split("\n").map((para) => {
    if (markers.some((m) => para.toLowerCase().includes(m.toLowerCase()))) return para;
    const sentences = para.match(SENTENCE_RE) ?? [para];
    const kept = sentences.filter((s) => {
      const hit = predictions.some((p) => s.toLowerCase().includes(p.toLowerCase()));
      if (hit) stripped.push(s.trim());
      return !hit;
    });
    return kept.join("");
  });

  return { text: paras.join("\n").replace(/\n{3,}/g, "\n\n").trim(), stripped };
}
