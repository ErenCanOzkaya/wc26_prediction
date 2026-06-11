"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/predictions/matches", label: "Predictions", match: "/predictions" },
  { href: "/leagues", label: "Leagues", match: "/leagues" },
  { href: "/calendar", label: "Calendar", match: "/calendar" },
  { href: "/rules", label: "Rules", match: "/rules" },
];

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-[57px] z-20 border-b border-white/8 bg-bg/70 px-4 backdrop-blur-xl sm:px-6">
      <ul className="mx-auto flex max-w-6xl gap-1 overflow-x-auto">
        {ITEMS.map((item) => {
          const active = item.match
            ? pathname.startsWith(item.match)
            : pathname === "/";
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`inline-block whitespace-nowrap border-b-2 px-3 py-3 text-sm font-bold transition ${
                  active
                    ? "border-green text-fg"
                    : "border-transparent text-muted hover:text-fg"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
