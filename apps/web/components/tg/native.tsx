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
        <div className="mx-1 mb-2 text-[12px] uppercase tracking-wide text-[var(--color-muted)]">
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
      style={{
        background: "var(--color-bg2)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-card)",
      }}
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
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[11px] font-serif text-[16px] text-white"
        style={{ background: accent || "var(--color-cinnabar)" }}
      >
        {icon}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="text-[15px] text-[var(--color-ink)]">{title}</div>
        {subtitle && (
          <div className="text-[12px] text-[var(--color-muted)]">{subtitle}</div>
        )}
      </div>
      <div className="shrink-0 text-[18px] text-[var(--color-muted)]">›</div>
    </div>
  );
}

/**
 * iOS 风格分段选择器（EP-fs-tg）。用于 TG 内替换 web 的下划线 Tab 行
 * （/fengshui）等「少量互斥选项」场景。颜色全部走 CSS 令牌，跟随 TG 明/暗主题。
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: React.ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="flex gap-[2px] p-[2px]"
      style={{ background: "var(--color-bg2)", borderRadius: "var(--radius-button)" }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className="flex-1 px-3 py-1.5 text-[13px]"
            style={{
              borderRadius: "calc(var(--radius-button) - 2px)",
              background: active ? "var(--color-paper)" : "transparent",
              color: active ? "var(--color-ink)" : "var(--color-muted)",
              boxShadow: active ? "var(--shadow-card)" : "none",
            }}
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
      className={`max-w-[84%] rounded-2xl px-3 py-2.5 text-[14px] leading-relaxed ${
        isUser ? "ml-auto text-white" : "text-[var(--color-ink-2)]"
      }`}
      style={
        isUser
          ? { background: "var(--color-cinnabar)" }
          : {
              background: "var(--color-bg2)",
              border: "1px solid var(--color-line)",
            }
      }
    >
      {children}
    </div>
  );
}
