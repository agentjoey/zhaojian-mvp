import type { ReactNode } from "react";

/**
 * 页头（当代东方 v3）：中文眉标「— X X —」+ 宋体标题 + 注解副标 + 细线。
 * 全站统一入口，取代此前三套并存的页头规格。装饰性拉丁 kicker 不再使用。
 */
export function PageHeader({
  kicker,
  title,
  annotation,
  action,
}: {
  kicker: string;
  title: ReactNode;
  annotation?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.3em]" style={{ color: "var(--color-muted)" }}>
            — {kicker} —
          </p>
          <h1 className="mt-3 font-serif text-[28px] font-bold leading-[1.25]">{title}</h1>
          {annotation && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--color-muted)" }}>
              {annotation}
            </p>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2 pt-8">{action}</div>}
      </div>
      <div className="mt-6 h-px" style={{ background: "var(--color-line)" }} aria-hidden />
    </header>
  );
}
