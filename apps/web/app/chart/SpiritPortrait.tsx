"use client";

import { useState } from "react";
import { SpiritSigil } from "./SpiritSigil";

/**
 * 本命之灵角色形象（EP-spirit-portrait）。按主导五行映射一张形象图，名号叠在底部渐隐上。
 * 现为深色电影感占位图(public/spirit/portrait-<element>.svg)；真渲染图日后同名替换即可。
 * 加载失败回退到水墨印记，绝不崩。
 */
export function SpiritPortrait({
  element,
  archetype,
  height = 280,
}: {
  element: string;
  archetype: string;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="mb-4 overflow-hidden rounded-[var(--radius-card)]">
      <div className="relative" style={{ height }}>
        {failed ? (
          <div className="flex h-full w-full items-center justify-center" style={{ background: "#14110d" }}>
            <SpiritSigil element={element} size={96} />
          </div>
        ) : (
          <img
            src={`/spirit/portrait-${element}.svg`}
            alt={`本命之灵 · ${archetype}`}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
            style={{ objectPosition: "center 28%" }}
          />
        )}
        {/* 底部渐隐 + 名号 */}
        <div
          className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 px-4 pb-3 pt-10"
          style={{ background: "linear-gradient(to top, rgba(10,9,7,.85), rgba(10,9,7,0))" }}
        >
          <SpiritSigil element={element} size={26} />
          <div className="min-w-0">
            <div className="font-serif text-[18px] font-semibold leading-tight text-white">{archetype}</div>
            <div className="text-[11px] tracking-wide text-white/70">本命之灵 · Natal Spirit</div>
          </div>
        </div>
      </div>
    </div>
  );
}
