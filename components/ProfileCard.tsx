"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Motif26 } from "@/components/Motif26";
import { setCountry } from "@/lib/profile/actions";

export interface CountryOption {
  id: number;
  name: string;
  crest_url: string | null;
}

export function ProfileCard({
  displayName,
  points,
  leagues,
  country,
  countries,
}: {
  displayName: string;
  points: number;
  leagues: number;
  country: CountryOption | null;
  countries: CountryOption[];
}) {
  const [open, setOpen] = useState(false);
  const [, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function changeCountry(id: number | null) {
    start(async () => {
      await setCountry(id);
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-white/12 py-1 pl-1 pr-3 transition hover:border-white/30"
      >
        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-white/8">
          {country?.crest_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={country.crest_url} alt="" className="h-5 w-5" />
          ) : (
            <span className="display text-xs">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </span>
        <span className="hidden max-w-[8rem] truncate text-sm font-bold sm:inline">
          {displayName}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-3xl border border-white/10 bg-elevated shadow-2xl">
          {/* card header */}
          <div className="relative h-16 overflow-hidden bg-gradient-to-br from-navy/40 via-surface to-red/25">
            <Motif26 className="absolute -right-3 -top-7 scale-[0.7] opacity-90" />
            <span className="absolute bottom-3 left-5 text-[9px] font-bold uppercase tracking-[0.25em] text-fg/70">
              We are 26
            </span>
          </div>

          {/* identity */}
          <div className="flex items-center gap-3 px-5 pt-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-white/5">
              {country?.crest_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={country.crest_url} alt="" className="h-8 w-8" />
              ) : (
                <span className="display text-2xl">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="display truncate text-xl">{displayName}</h3>
              <p className="text-xs text-muted">
                {country?.name ?? "Pick your nation"}
              </p>
            </div>
          </div>

          {/* stats */}
          <div className="mt-4 grid grid-cols-2 gap-2 px-5">
            <div className="rounded-xl bg-white/5 px-3 py-2">
              <div className="display text-2xl text-green">{points}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted">
                points
              </div>
            </div>
            <div className="rounded-xl bg-white/5 px-3 py-2">
              <div className="display text-2xl">{leagues}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted">
                leagues
              </div>
            </div>
          </div>

          {/* country picker + sign out */}
          <div className="mt-4 space-y-2 px-5 pb-5">
            <select
              value={country?.id ?? ""}
              onChange={(e) =>
                changeCountry(e.target.value ? Number(e.target.value) : null)
              }
              className="field !py-2 text-sm"
            >
              <option value="">Choose your nation…</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn btn-ghost w-full">
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
