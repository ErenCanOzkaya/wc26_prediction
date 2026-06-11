"use client";

import { useState, useTransition } from "react";
import { saveMatchPrediction } from "@/lib/predictions/actions";

export interface TeamLite {
  id: number;
  name: string;
  short_name: string | null;
  crest_url: string | null;
}

export interface MatchRowData {
  id: number;
  time: string;
  meta: string; // stage / group label
  accent: string; // CSS colour
  locked: boolean;
  status: string;
  home: TeamLite;
  away: TeamLite;
  resultHome: number | null;
  resultAway: number | null;
  predHome: number | null;
  predAway: number | null;
}

function Crest({ team }: { team: TeamLite }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/8">
      {team.crest_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={team.crest_url} alt="" className="h-5 w-5" />
      ) : (
        <span className="text-[10px] text-muted">?</span>
      )}
    </span>
  );
}

export function MatchPredictionRow({ match }: { match: MatchRowData }) {
  const [home, setHome] = useState(match.predHome?.toString() ?? "");
  const [away, setAway] = useState(match.predAway?.toString() ?? "");
  const [saved, setSaved] = useState<"idle" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a)) return;
    startTransition(async () => {
      const res = await saveMatchPrediction(match.id, h, a);
      if (res.error) {
        setSaved("error");
        setMsg(res.error);
      } else {
        setSaved("ok");
        setMsg("");
      }
    });
  }

  const scoreInput = (val: string, set: (v: string) => void) => (
    <input
      inputMode="numeric"
      value={val}
      onChange={(e) => set(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
      onBlur={save}
      className="h-10 w-10 rounded-xl border border-white/12 bg-bg/40 text-center text-base font-bold text-fg outline-none focus:border-green"
      placeholder="–"
    />
  );

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/8 p-3"
      style={{
        background: `color-mix(in srgb, ${match.accent} 11%, var(--color-surface))`,
      }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: match.accent }}
      />
      <div className="flex items-center gap-3 pl-1.5">
        {/* time */}
        <div className="w-16 shrink-0">
          <div className="display text-xl leading-none">{match.time}</div>
          <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted">
            {match.meta}
          </div>
        </div>

        {/* home */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className="truncate text-right text-sm font-bold">
            {match.home.short_name || match.home.name}
          </span>
          <Crest team={match.home} />
        </div>

        {/* score / inputs */}
        {match.locked ? (
          <div className="w-20 text-center">
            <div className="display text-lg leading-none">
              {match.resultHome != null && match.resultAway != null
                ? `${match.resultHome}–${match.resultAway}`
                : "vs"}
            </div>
            <div className="text-[9px] uppercase tracking-wide text-muted">
              {match.status === "finished" ? (
                "final"
              ) : match.status === "live" ? (
                <span className="inline-flex items-center gap-1 font-bold text-red">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red" />
                  </span>
                  Live
                </span>
              ) : match.predHome != null ? (
                `you ${match.predHome}–${match.predAway}`
              ) : (
                "locked"
              )}
            </div>
          </div>
        ) : (
          <div className="flex w-20 items-center justify-center gap-1">
            {scoreInput(home, setHome)}
            <span className="text-muted">:</span>
            {scoreInput(away, setAway)}
          </div>
        )}

        {/* away */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Crest team={match.away} />
          <span className="truncate text-sm font-bold">
            {match.away.short_name || match.away.name}
          </span>
        </div>

        {/* status */}
        <span className="hidden w-10 shrink-0 text-right text-[10px] sm:block">
          {pending ? (
            <span className="text-muted">…</span>
          ) : saved === "ok" ? (
            <span className="text-green">saved</span>
          ) : saved === "error" ? (
            <span className="text-red" title={msg}>
              err
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
