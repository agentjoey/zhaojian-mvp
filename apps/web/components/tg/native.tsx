"use client";

import React from "react";

export function Section({
  title,
  children,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      {title && (
        <div className="mx-1 mb-2 text-[11px] tracking-[0.24em] text-[var(--color-muted)]">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function Group({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-[var(--color-line)]"
      style={{ borderTop: "1px solid var(--color-line)" }}
    >
      {children}
    </div>
  );
}

export function Cell({
  icon,
  title,
  subtitle,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  accent?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-[14px] py-[14px] ${
        onClick ? "cursor-pointer active:opacity-80" : ""
      }`}
    >
      <div
        className="shrink-0 font-serif text-[18px]"
        style={{ color: accent || "var(--color-cinnabar)" }}
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="text-[15px] text-[var(--color-ink)]">{title}</div>
        {subtitle && (
          <div className="text-[12px] text-[var(--color-muted)]">{subtitle}</div>
        )}
      </div>
      {/* chevron 暗示可点——只在真有 onClick 时渲染（评审 M2），否则每行都挂一个
          点不动的箭头。 */}
      {onClick && (
        <div className="shrink-0 text-[18px] text-[var(--color-muted)]">›</div>
      )}
    </div>
  );
}

/**
 * 分段选择器（EP-fs-tg；EP-tg-parity 起改为东方编辑式：细线/朱红描边）。
 * 颜色全部走 CSS 令牌，跟随 TG 明/暗主题。
 *
 * 两种语义模式（评审 M4——ARIA 契约要么建全、要么别建一半）：
 * - 传 `idBase`：**真 Tab**（tablist/tab + aria-controls + 面板配对 + 方向键漫游
 *   + roving tabindex）。调用方必须用 `${idBase}-panel-<value>` 渲染对应
 *   role="tabpanel" 的内容区（`aria-labelledby={`${idBase}-tab-<value>`}`），
 *   否则 aria-controls 指向不存在的节点，比不写更糟。
 * - 不传 `idBase`：普通**单选按钮组**（role="group" + aria-pressed），用于
 *   「住宅/办公」这类并不切换面板的互斥选项——它们不是 tab，不该穿 tab 的壳。
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  idBase,
  ariaLabel,
}: {
  options: readonly { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  idBase?: string;
  ariaLabel?: string;
}) {
  const listRef = React.useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!idBase) return; // 组模式：原生 Tab 序即可，无方向键语义
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = options.findIndex((o) => o.value === value);
    const next =
      e.key === "ArrowRight"
        ? (idx + 1) % options.length
        : (idx - 1 + options.length) % options.length;
    onChange(options[next]!.value);
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
      [next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role={idBase ? "tablist" : "group"}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={idBase ? "flex gap-1" : "flex gap-2"}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            {...(idBase
              ? {
                  role: "tab",
                  id: `${idBase}-tab-${o.value}`,
                  "aria-selected": active,
                  "aria-controls": `${idBase}-panel-${o.value}`,
                  tabIndex: active ? 0 : -1,
                }
              : { "aria-pressed": active })}
            onClick={() => onChange(o.value)}
            className={
              idBase
                ? "px-3 py-2 text-[14px]"
                : "flex-1 rounded-[var(--radius-button)] border py-2 text-[14px]"
            }
            style={
              idBase
                ? {
                    color: active ? "var(--color-cinnabar)" : "var(--color-ink-2)",
                    borderBottom: active ? "2px solid var(--color-cinnabar)" : "2px solid transparent",
                  }
                : {
                    borderColor: active ? "var(--color-cinnabar)" : "var(--color-line)",
                    color: active ? "var(--color-cinnabar)" : "var(--color-ink)",
                  }
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Bubble({
  role,
  children,
}: {
  role: "spirit" | "user";
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div
      className={`max-w-[84%] rounded-[var(--radius-card)] px-4 py-3 text-[14px] leading-relaxed ${
        isUser ? "ml-auto text-white" : "text-[var(--color-ink-2)]"
      }`}
      style={
        isUser
          ? { background: "var(--color-cinnabar)" }
          : {
              background: "var(--color-paper)",
              border: "1px solid var(--color-line)",
            }
      }
    >
      {children}
    </div>
  );
}
