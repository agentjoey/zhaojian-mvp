"use client";

import { useEffect, useState } from "react";

function getIsDark(): boolean {
  if (typeof window === "undefined") return false;
  return document.documentElement.getAttribute("data-tg-theme") === "dark";
}

export function DarkImageOverlay({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [isDark, setIsDark] = useState(getIsDark);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setIsDark(getIsDark());
    const observer = new MutationObserver(() => {
      setIsDark(getIsDark());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-tg-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`relative ${className ?? ""}`}>
      {children}
      {isDark && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(rgba(16,14,11,.45), rgba(16,14,11,.55))",
          }}
        />
      )}
    </div>
  );
}
