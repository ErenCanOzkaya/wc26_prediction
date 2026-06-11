"use client";

import { useMemo, useState, useTransition } from "react";
import { saveTournamentXi } from "@/lib/predictions/actions";
import { matches } from "@/lib/text";
import type { PlayerLite } from "@/components/PlayerCombobox";

type Slot = { pos: string; x: number; y: number };

const FORMATIONS: Record<string, Slot[]> = {
  "4-3-3": [
    { pos: "GK", x: 50, y: 90 },
    { pos: "DEF", x: 16, y: 71 }, { pos: "DEF", x: 39, y: 74 },
    { pos: "DEF", x: 61, y: 74 }, { pos: "DEF", x: 84, y: 71 },
    { pos: "MID", x: 26, y: 50 }, { pos: "MID", x: 50, y: 50 }, { pos: "MID", x: 74, y: 50 },
    { pos: "ATT", x: 23, y: 25 }, { pos: "ATT", x: 50, y: 22 }, { pos: "ATT", x: 77, y: 25 },
  ],
  "4-4-2": [
    { pos: "GK", x: 50, y: 90 },
    { pos: "DEF", x: 16, y: 71 }, { pos: "DEF", x: 39, y: 74 },
    { pos: "DEF", x: 61, y: 74 }, { pos: "DEF", x: 84, y: 71 },
    { pos: "MID", x: 16, y: 49 }, { pos: "MID", x: 39, y: 50 },
    { pos: "MID", x: 61, y: 50 }, { pos: "MID", x: 84, y: 49 },
    { pos: "ATT", x: 36, y: 24 }, { pos: "ATT", x: 64, y: 24 },
  ],
  "3-5-2": [
    { pos: "GK", x: 50, y: 90 },
    { pos: "DEF", x: 27, y: 73 }, { pos: "DEF", x: 50, y: 75 }, { pos: "DEF", x: 73, y: 73 },
    { pos: "MID", x: 12, y: 51 }, { pos: "MID", x: 31, y: 53 }, { pos: "MID", x: 50, y: 50 },
    { pos: "MID", x: 69, y: 53 }, { pos: "MID", x: 88, y: 51 },
    { pos: "ATT", x: 36, y: 24 }, { pos: "ATT", x: 64, y: 24 },
  ],
  "4-2-3-1": [
    { pos: "GK", x: 50, y: 90 },
    { pos: "DEF", x: 16, y: 73 }, { pos: "DEF", x: 39, y: 76 },
    { pos: "DEF", x: 61, y: 76 }, { pos: "DEF", x: 84, y: 73 },
    { pos: "MID", x: 34, y: 56 }, { pos: "MID", x: 66, y: 56 },
    { pos: "MID", x: 24, y: 37 }, { pos: "MID", x: 50, y: 38 }, { pos: "MID", x: 76, y: 37 },
    { pos: "ATT", x: 50, y: 20 },
  ],
};

// Map provider positions to pitch roles so each slot only accepts its role.
const ROLE: Record<string, string> = {
  Goalkeeper: "GK",
  Defence: "DEF",
  Midfield: "MID",
  Offence: "ATT",
};

function initials(name: string) {
  const parts = name.split(" ");
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export function TournamentXI({
  players,
  locked,
  initial,
}: {
  players: PlayerLite[];
  locked: boolean;
  initial: {
    formation: string;
    captainId: number | null;
    picks: Record<number, number>;
  };
}) {
  const [formation, setFormation] = useState(initial.formation || "4-3-3");
  const [picks, setPicks] = useState<Record<number, number>>(initial.picks);
  const [captain, setCaptain] = useState<number | null>(initial.captainId);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const slots = FORMATIONS[formation];
  const filledCount = Object.keys(picks).length;

  const activePos = activeSlot != null ? slots[activeSlot]?.pos : null;
  const results = useMemo(() => {
    if (activeSlot == null || !activePos) return [];
    const used = new Set(Object.values(picks));
    const cur = picks[activeSlot];
    const q = query.trim();
    return players
      .filter((p) => ROLE[p.position ?? ""] === activePos) // role-constrained
      .filter((p) => !used.has(p.id) || p.id === cur)
      .filter(
        (p) => !q || matches(p.name, q) || matches(p.teamName, q),
      )
      .slice(0, 50);
  }, [players, query, activeSlot, activePos, picks]);

  function pick(slot: number, id: number) {
    setPicks((p) => ({ ...p, [slot]: id }));
    setActiveSlot(null);
    setQuery("");
  }
  function clearSlot(slot: number) {
    setPicks((p) => {
      const n = { ...p };
      const removed = n[slot];
      delete n[slot];
      if (captain === removed) setCaptain(null);
      return n;
    });
  }

  function save() {
    start(async () => {
      const res = await saveTournamentXi({
        formation,
        captainId: captain,
        picks: Object.entries(picks).map(([slot, playerId]) => ({
          slot: Number(slot),
          playerId,
        })),
      });
      if (res.error) {
        setStatus("error");
        setMsg(res.error);
      } else {
        setStatus("ok");
        setMsg("XI saved.");
      }
    });
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">Formation</span>
          <select
            value={formation}
            onChange={(e) => setFormation(e.target.value)}
            disabled={locked}
            className="field !w-auto !py-1.5"
          >
            {Object.keys(FORMATIONS).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <span className="text-xs text-muted">{filledCount}/11 picked</span>
        {!locked && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="btn btn-primary ml-auto"
          >
            {pending ? "Saving…" : "Save XI"}
          </button>
        )}
        {status !== "idle" && (
          <span className={status === "error" ? "text-red" : "text-green"}>
            {msg}
          </span>
        )}
      </div>

      {/* Pitch */}
      <div className="relative mx-auto aspect-[3/4] max-w-md overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-green/25 to-green/10">
        {/* field lines */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-white/15" />
          <div className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/15" />
          <div className="absolute left-1/2 top-0 h-14 w-32 -translate-x-1/2 border border-t-0 border-white/15" />
          <div className="absolute bottom-0 left-1/2 h-14 w-32 -translate-x-1/2 border border-b-0 border-white/15" />
        </div>

        {slots.map((s, i) => {
          const pid = picks[i];
          const player = pid ? byId.get(pid) : undefined;
          const isCaptain = captain != null && captain === pid;
          return (
            <div
              key={i}
              className="absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
            >
              <button
                type="button"
                disabled={locked}
                onClick={() => setActiveSlot(i)}
                className={`relative flex h-11 w-11 items-center justify-center rounded-full border-2 text-xs font-bold transition ${
                  player
                    ? "border-green bg-bg text-fg"
                    : "border-dashed border-white/40 bg-white/10 text-muted"
                }`}
              >
                {player ? initials(player.name) : "+"}
                {isCaptain && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-green text-[9px] font-bold text-bg">
                    C
                  </span>
                )}
              </button>
              {player ? (
                <>
                  <span className="max-w-[5rem] truncate text-[10px] font-semibold text-fg">
                    {player.name.split(" ").slice(-1)[0]}
                  </span>
                  {!locked && (
                    <div className="flex gap-1 text-[9px]">
                      <button
                        type="button"
                        onClick={() => setCaptain(isCaptain ? null : pid)}
                        className={isCaptain ? "text-green" : "text-muted"}
                      >
                        {isCaptain ? "captain" : "make C"}
                      </button>
                      <button
                        type="button"
                        onClick={() => clearSlot(i)}
                        className="text-muted hover:text-red"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <span className="text-[9px] font-bold uppercase text-green/80">
                  {s.pos}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Player picker */}
      {activeSlot != null && !locked && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-bg/70 p-4"
          onClick={() => setActiveSlot(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-elevated p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-green">
              Pick a {activePos}
            </div>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search player or team…"
              className="field mb-2"
            />
            <ul className="max-h-72 overflow-auto">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(activeSlot, p.id)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5"
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
                <li className="px-2 py-2 text-sm text-muted">No players.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
