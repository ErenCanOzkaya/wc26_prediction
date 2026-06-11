"use client";

import { useEffect, useState } from "react";
import { getLeaderboard } from "@/lib/games/career";

interface Row {
  display_name: string;
  points: number;
  time_ms: number;
  games: number;
  solved: number;
}

export function CareerLeaderboard({
  leagues,
}: {
  leagues: { id: string; name: string }[];
}) {
  const [period, setPeriod] = useState<"daily" | "all">("daily");
  const [scope, setScope] = useState<string>("global");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let alive = true;
    getLeaderboard(scope, period).then((res) => {
      if (alive && "rows" in res) setRows(res.rows as Row[]);
    });
    return () => {
      alive = false;
    };
  }, [scope, period]);

  return (
    <div className="surface p-4">
      <div className="mb-3 flex flex-wrap gap-2">
        {(["daily", "all"] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`pill ${period === p ? "bg-green/25 text-green" : ""}`}
          >
            {p === "daily" ? "Today" : "All-time"}
          </button>
        ))}
        <span className="mx-1 w-px bg-white/10" />
        <button
          type="button"
          onClick={() => setScope("global")}
          className={`pill ${scope === "global" ? "bg-green/25 text-green" : ""}`}
        >
          Global
        </button>
        {leagues.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setScope(l.id)}
            className={`pill ${scope === l.id ? "bg-green/25 text-green" : ""}`}
          >
            {l.name}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No scores yet.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.display_name} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-right text-muted">{i + 1}</span>
              <span className="flex-1 truncate font-bold">{r.display_name}</span>
              <span className="text-xs text-muted">{r.solved}/{r.games}</span>
              <span className="display w-12 text-right text-green">{r.points}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
