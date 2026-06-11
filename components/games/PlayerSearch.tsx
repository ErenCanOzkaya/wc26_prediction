"use client";

import { useMemo, useState } from "react";
import { matches } from "@/lib/text";

export interface SearchPlayer {
  id: number;
  name: string;
}

export function PlayerSearch({
  players,
  exclude,
  disabled,
  onPick,
}: {
  players: SearchPlayer[];
  exclude: number[];
  disabled?: boolean;
  onPick: (id: number) => void;
}) {
  const [q, setQ] = useState("");
  const excludeSet = useMemo(() => new Set(exclude), [exclude]);
  const results = useMemo(
    () =>
      q.trim().length < 2
        ? []
        : players
            .filter((p) => !excludeSet.has(p.id) && matches(p.name, q))
            .slice(0, 8),
    [q, players, excludeSet],
  );

  return (
    <div className="relative">
      <input
        className="field w-full"
        placeholder="Search for player"
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-black/90 backdrop-blur">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-sm hover:bg-white/8"
                onClick={() => {
                  onPick(p.id);
                  setQ("");
                }}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
