"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SealIcon, cn } from "@/components/ui";

const NAV = [
  { href: "/", char: "照", label: "首页" },
  { href: "/chart", char: "盘", label: "命盘" },
  { href: "/calendar", char: "历", label: "运势" },
  { href: "/profiles", char: "我", label: "档案" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";

  return (
    <div className="min-h-screen md:pl-[68px]">
      {/* 桌面：左侧深色竖栏 */}
      <nav
        className="fixed inset-y-0 left-0 z-30 hidden w-[68px] flex-col items-center gap-1 py-5 md:flex"
        style={{ background: "var(--color-ink)" }}
      >
        <Link href="/" className="mb-4" aria-label="照见 首页">
          <SealIcon char="照" size={40} />
        </Link>
        {NAV.slice(1).map((item) => (
          <NavItem key={item.href} {...item} active={isActive(pathname, item.href)} />
        ))}
      </nav>

      {/* 移动：底部图标栏 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around py-2 md:hidden"
        style={{ background: "var(--color-ink)", paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
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
    <Link href={href} className="flex flex-col items-center gap-1 px-2 py-1.5" aria-label={label}>
      {active ? (
        <SealIcon char={char} size={38} />
      ) : (
        <span
          className={cn("inline-flex items-center justify-center font-semibold transition-colors")}
          style={{
            width: 38,
            height: 38,
            borderRadius: "var(--radius-seal)",
            fontSize: 19,
            color: "var(--color-on-ink-faint)",
          }}
        >
          {char}
        </span>
      )}
      <span className="text-[10px]" style={{ color: active ? "var(--color-on-ink)" : "var(--color-on-ink-faint)" }}>
        {label}
      </span>
    </Link>
  );
}
