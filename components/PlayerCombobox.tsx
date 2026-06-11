"use client";

import { useMemo, useState } from "react";
import { matches } from "@/lib/text";

export interface PlayerLite {
  id: number;
  name: string;
  teamName: string;
  position: string | null;
  eligibleYoung: boolean;
}

export function PlayerCombobox({
  label,
  hint,
  accent,
  players,
  value,
  onChange,
  disabled,
  eligibleYoungOnly,
}: {
  label: string;
  hint?: string;
  accent: string;
  players: PlayerLite[];
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
  eligibleYoungOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const pool = useMemo(
    () => (eligibleYoungOnly ? players.filter((p) => p.eligibleYoung) : players),
    [players, eligibleYoungOnly],
  );
  const selected = pool.find((p) => p.id === value) ?? null;

  const results = useMemo(() => {
    const q = query.trim();
    const base = q
      ? pool.filter((p) => matches(p.name, q) || matches(p.teamName, q))
      : pool;
    return base.slice(0, 40);
  }, [pool, query]);

  return (
    <div className="surface relative overflow-hidden p-4">
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: accent }}
      />
      <div className="mb-2 flex items-baseline justify-between pt-0.5">
        <h3 className="display text-lg">{label}</h3>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="field flex items-center justify-between text-left disabled:opacity-60"
      >
        <span className={selected ? "" : "text-muted"}>
          {selected
            ? `${selected.name} · ${selected.teamName}`
            : disabled
              ? "Locked"
              : "Choose a player…"}
        </span>
        {selected && !disabled && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="ml-2 text-muted hover:text-red"
          >
            clear
          </span>
        )}
      </button>

      {open && !disabled && (
        <div className="mt-2 rounded-xl border border-white/10 bg-bg p-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search player or team…"
            className="field mb-2 !py-2"
          />
          <ul className="max-h-60 overflow-auto">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5 ${
                    p.id === value ? "bg-green/15" : ""
                  }`}
                >
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted">
                    {p.teamName}
                    {p.position ? ` · ${p.position}` : ""}
                  </span>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="px-2 py-2 text-sm text-muted">No players found.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
