"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellLogo, cn } from "@/components/ui";

const NAV = [
  { href: "/", char: "照", label: "首页" },
  { href: "/calendar", char: "运", label: "运势" },
  { href: "/chart", char: "盘", label: "解读" },
  ...(process.env.NEXT_PUBLIC_SPIRIT_ENABLED === "1"
    ? [{ href: "/spirit", char: "灵", label: "本命" }]
    : []),
  { href: "/profiles", char: "我", label: "档案" },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="min-h-screen md:pl-[82px]">
      {/* 桌面：左侧素白图标栏 */}
      <nav
        className="fixed inset-y-0 left-0 z-30 hidden w-[82px] flex-col items-center gap-2 py-6 md:flex"
        style={{ background: "var(--color-rail)", borderRight: "1px solid var(--color-line)" }}
      >
        <Link href="/" className="mb-5" aria-label="照见 首页">
          <BellLogo size={30} />
        </Link>
        {NAV.slice(1).map((item) => (
          <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      {/* 移动：底部毛玻璃图标栏 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-start justify-around pt-2.5 md:hidden"
        style={{
          background: "rgba(246,245,241,.92)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderTop: "1px solid var(--color-line)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)",
        }}
      >
        {NAV.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      <div className="pb-24 md:pb-0">{children}</div>
    </div>
  );
}

function NavItem({ href, char, label, active }: { href: string; char: string; label: string; active: boolean }) {
  return (
    <Link href={href} className="zj-nav flex flex-col items-center gap-1 px-2 py-1.5" aria-label={label}>
      <span
        key={active ? "on" : "off"}
        className="inline-flex items-center justify-center font-semibold"
        style={{
          width: 36,
          height: 36,
          borderRadius: "var(--radius-icon)",
          fontFamily: "var(--font-serif)",
          fontSize: 18,
          background: active ? "var(--color-cinnabar)" : "transparent",
          color: active ? "#fff" : "var(--color-muted)",
          boxShadow: active ? "0 7px 16px rgba(203,70,54,.34)" : "none",
          transform: active ? "translateY(-3px)" : "none",
          transition: "background .25s, color .25s, box-shadow .25s, transform .25s",
          animation: active ? "zjPop .45s var(--ease-pop)" : undefined,
        }}
      >
        {char}
      </span>
      <span className="text-[10px]" style={{ color: active ? "var(--color-ink)" : "var(--color-muted)", transition: "color .25s" }}>
        {label}
      </span>
      <span
        style={{
          width: 4, height: 4, borderRadius: "50%", background: "var(--color-cinnabar)",
          opacity: active ? 1 : 0, transform: `scale(${active ? 1 : 0})`, transition: "opacity .25s, transform .25s",
        }}
      />
    </Link>
  );
}
