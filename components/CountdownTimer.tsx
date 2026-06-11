"use client";

import { useEffect, useState } from "react";

function diff(target: number, now: number) {
  const ms = Math.max(0, target - now);
  const s = Math.floor(ms / 1000);
  return {
    ms,
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

function Unit({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <span className="flex items-baseline gap-0.5">
      <span
        className="display text-xl leading-none tabular-nums"
        style={color ? { color } : undefined}
      >
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[9px] font-bold uppercase text-muted">{label}</span>
    </span>
  );
}

/**
 * Countdown to the user's next relevant kickoff (their next watched match, else
 * next overall). The seconds shift green → red as kickoff approaches.
 */
export function CountdownTimer({
  targetIso,
  caption = "Kickoff in",
  matchLabel,
}: {
  targetIso: string | null;
  caption?: string;
  matchLabel?: string | null;
}) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    // Live clock (legitimate setState-in-effect, gated by `mounted`).
    /* eslint-disable react-hooks/set-state-in-effect */
    setMounted(true);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => clearInterval(id);
  }, []);

  if (!mounted || !targetIso) {
    return <div className="h-10 w-[14rem]" aria-hidden />;
  }

  const t = diff(new Date(targetIso).getTime(), now);
  // Urgency: green far out, sand within 6h, red within 1h.
  const urgent =
    t.ms < 3_600_000
      ? "var(--color-red)"
      : t.ms < 21_600_000
        ? "var(--color-sand)"
        : "var(--color-green)";

  return (
    <div
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-1.5"
      title={matchLabel ?? undefined}
    >
      <div className="hidden flex-col leading-tight sm:flex">
        <span
          className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.18em]"
          style={{ color: urgent }}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
              style={{ background: urgent }}
            />
            <span
              className="relative inline-flex h-1.5 w-1.5 rounded-full"
              style={{ background: urgent }}
            />
          </span>
          {caption}
        </span>
        {matchLabel && (
          <span className="max-w-[11rem] truncate text-[10px] font-semibold text-muted">
            {matchLabel}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2.5">
        <Unit value={t.days} label="d" />
        <Unit value={t.hours} label="h" />
        <Unit value={t.minutes} label="m" />
        <Unit value={t.seconds} label="s" color={urgent} />
      </div>
    </div>
  );
}
