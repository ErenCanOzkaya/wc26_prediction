"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/predictions/matches", label: "Match scores" },
  { href: "/predictions/groups", label: "Group standings" },
  { href: "/predictions/bracket", label: "Bracket" },
  { href: "/predictions/specials", label: "Specials" },
];

export function PredictionsTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`pill ${pathname === t.href ? "pill-active" : ""}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
