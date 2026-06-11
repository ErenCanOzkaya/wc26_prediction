"use client";

import { useMemo, useState, useTransition } from "react";
import { toggleWatch } from "@/lib/watchlist/actions";
import { matches as textMatches } from "@/lib/text";

export interface CalMatch {
  id: number;
  stage: string;
  groupLabel: string | null;
  venue: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  day: string;
  time: string;
  homeName: string;
  awayName: string;
  homeCrest: string | null;
  awayCrest: string | null;
}

const STAGES: { key: string; label: string }[] = [
  { key: "group", label: "Group stage" },
  { key: "r32", label: "Round of 32" },
  { key: "r16", label: "Round of 16" },
  { key: "qf", label: "Quarter-finals" },
  { key: "sf", label: "Semi-finals" },
  { key: "third_place", label: "Third place" },
  { key: "final", label: "Final" },
];
const GROUPS = "ABCDEFGHIJKL".split("");
const ACCENTS = [
  "var(--color-green)",
  "var(--color-navy)",
  "var(--color-red)",
  "var(--color-sand)",
];

function Crest({ url, name }: { url: string | null; name: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/8">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-5 w-5" />
      ) : (
        <span className="text-[10px] text-muted">{name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export function CalendarView({
  matches,
  watchedIds,
}: {
  matches: CalMatch[];
  watchedIds: number[];
}) {
  const [watched, setWatched] = useState<Set<number>>(new Set(watchedIds));
  const [stage, setStage] = useState("");
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");
  const [, start] = useTransition();

  function toggle(id: number) {
    const next = new Set(watched);
    const willWatch = !next.has(id);
    if (willWatch) next.add(id);
    else next.delete(id);
    setWatched(next);
    start(async () => {
      const res = await toggleWatch(id, willWatch);
      if (res.error) {
        setWatched((cur) => {
          const r = new Set(cur);
          if (willWatch) r.delete(id);
          else r.add(id);
          return r;
        });
      }
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim();
    return matches.filter((m) => {
      if (stage && m.stage !== stage) return false;
      if (group && m.groupLabel !== group) return false;
      if (q && !textMatches(m.homeName, q) && !textMatches(m.awayName, q))
        return false;
      return true;
    });
  }, [matches, stage, group, query]);

  const sections: { day: string; items: CalMatch[] }[] = [];
  for (const m of filtered) {
    const last = sections[sections.length - 1];
    if (last && last.day === m.day) last.items.push(m);
    else sections.push({ day: m.day, items: [m] });
  }

  let idx = 0;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="field !w-auto !py-2"
        >
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          className="field !w-auto !py-2"
        >
          <option value="">All groups</option>
          {GROUPS.map((g) => (
            <option key={g} value={g}>
              Group {g}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search team…"
          className="field !w-44 !py-2"
        />
        <a
          href="/calendar/export"
          className={`btn ml-auto ${
            watched.size
              ? "btn-primary"
              : "btn-ghost pointer-events-none opacity-50"
          }`}
        >
          ★ Export {watched.size} .ics
        </a>
      </div>

      <div className="space-y-7">
        {sections.map((s) => (
          <section key={s.day}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-muted">
              <span className="h-px flex-1 bg-white/8" />
              {s.day}
              <span className="h-px flex-1 bg-white/8" />
            </h3>
            <div className="space-y-2">
              {s.items.map((m) => {
                const accent = ACCENTS[idx++ % ACCENTS.length];
                const isWatched = watched.has(m.id);
                return (
                  <div
                    key={m.id}
                    className="relative overflow-hidden rounded-2xl border border-white/8 p-3"
                    style={{
                      background: `color-mix(in srgb, ${accent} 10%, var(--color-surface))`,
                    }}
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-1"
                      style={{ background: accent }}
                    />
                    <div className="flex items-center gap-3 pl-1.5">
                      <div className="w-16 shrink-0">
                        {m.status === "live" &&
                        m.homeScore != null &&
                        m.awayScore != null ? (
                          <>
                            <div className="display text-lg leading-none">
                              {m.homeScore}–{m.awayScore}
                            </div>
                            <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-red">
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red opacity-70" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red" />
                              </span>
                              Live
                            </span>
                          </>
                        ) : m.status === "finished" &&
                          m.homeScore != null &&
                          m.awayScore != null ? (
                          <>
                            <div className="display text-lg leading-none">
                              {m.homeScore}–{m.awayScore}
                            </div>
                            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">
                              FT
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="display text-lg leading-none">
                              {m.time}
                            </div>
                            <div className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted">
                              {m.groupLabel
                                ? `Group ${m.groupLabel}`
                                : stageLabel(m.stage)}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                        <span className="truncate text-right text-sm font-bold">
                          {m.homeName}
                        </span>
                        <Crest url={m.homeCrest} name={m.homeName} />
                      </div>
                      <span className="text-xs text-muted">vs</span>
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Crest url={m.awayCrest} name={m.awayName} />
                        <span className="truncate text-sm font-bold">
                          {m.awayName}
                        </span>
                      </div>

                      <a
                        href={`/matches/${m.id}`}
                        title="Match details"
                        className="shrink-0 rounded-lg border border-white/12 px-2 py-1.5 text-xs text-muted hover:text-fg"
                      >
                        ›
                      </a>
                      <a
                        href={`/calendar/export?match=${m.id}`}
                        title="Add to calendar"
                        className="hidden shrink-0 rounded-lg border border-white/12 px-2 py-1.5 text-xs text-muted hover:text-fg sm:block"
                      >
                        ⤓
                      </a>
                      <button
                        type="button"
                        onClick={() => toggle(m.id)}
                        title="I'll watch"
                        className={`w-7 shrink-0 text-lg ${
                          isWatched ? "text-red" : "text-muted"
                        }`}
                      >
                        {isWatched ? "★" : "☆"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {sections.length === 0 && (
          <p className="text-sm text-muted">No matches match those filters.</p>
        )}
      </div>
    </div>
  );
}

function stageLabel(stage: string): string {
  return STAGES.find((s) => s.key === stage)?.label ?? stage;
}
