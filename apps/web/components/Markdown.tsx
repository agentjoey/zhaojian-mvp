import type { ReactNode } from "react";

/**
 * 轻量 markdown 渲染（无依赖）——覆盖 LLM 解读实际产出的子集：
 * 段落、**加粗**、`- `/`* ` 无序列表、`1. ` 有序列表、`> ` 引用。与照见排版一致。
 */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>,
  );
}

function Block({ raw }: { raw: string }) {
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return null;

  if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
    return (
      <ul className="my-2 space-y-1 pl-1">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2"><span className="select-none text-cinnabar">·</span><span>{inline(l.replace(/^\s*[-*]\s+/, ""))}</span></li>
        ))}
      </ul>
    );
  }
  if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
    return (
      <ol className="my-2 space-y-1 pl-1">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2"><span className="select-none font-latin text-cinnabar">{i + 1}.</span><span>{inline(l.replace(/^\s*\d+\.\s+/, ""))}</span></li>
        ))}
      </ol>
    );
  }
  if (lines.every((l) => /^\s*>\s?/.test(l))) {
    return (
      <blockquote className="my-2 border-l-2 pl-3 text-ink-2" style={{ borderColor: "var(--color-gold)" }}>
        {inline(lines.map((l) => l.replace(/^\s*>\s?/, "")).join(" "))}
      </blockquote>
    );
  }
  return (
    <p className="my-2 leading-[1.85]">
      {lines.flatMap((l, i) => (i ? [<br key={`br${i}`} />, ...inline(l)] : inline(l)))}
    </p>
  );
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/).filter((b) => b.trim());
  return <>{blocks.map((b, i) => <Block key={i} raw={b} />)}</>;
}
