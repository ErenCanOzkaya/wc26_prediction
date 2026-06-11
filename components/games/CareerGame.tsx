"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  submitGuess,
  skipReveal,
  startCareerGame,
  type GameView,
} from "@/lib/games/career";
import { CareerTimeline } from "./CareerTimeline";
import { GuessRow } from "./GuessRow";
import { PlayerSearch, type SearchPlayer } from "./PlayerSearch";

function Timer({ running }: { running: boolean }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setS((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span className="display text-lg tabular-nums">{mm}:{ss}</span>;
}

export function CareerGame({
  initial,
  players,
  crests,
}: {
  initial: GameView;
  players: SearchPlayer[];
  crests: Record<string, string>;
}) {
  const [view, setView] = useState<GameView>(initial);
  const [busy, setBusy] = useState(false);
  const [guessedIds, setGuessedIds] = useState<number[]>(() =>
    view.guesses.map((g) => g.playerId)
  );

  const apply = (next: GameView | { error: string }) => {
    if ("error" in next) return;
    setGuessedIds(next.guesses.map((g) => g.playerId));
    setView(next);
  };

  const onPick = async (id: number) => {
    if (busy || view.finished) return;
    setBusy(true);
    apply(await submitGuess(view.sessionId, id));
    setBusy(false);
  };
  const onSkip = async () => {
    if (busy || view.finished) return;
    setBusy(true);
    apply(await skipReveal(view.sessionId));
    setBusy(false);
  };
  const onNext = async () => {
    setBusy(true);
    apply(await startCareerGame("practice"));
    setBusy(false);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
          {view.mode === "daily" ? "Daily puzzle" : "Practice"}
        </span>
        <Timer running={!view.finished} />
      </div>

      {view.finished && view.answer && (
        <div className="surface mb-4 p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-muted">
            {view.solved ? "Solved 🎉" : "The player was"}
          </p>
          <p className="display mt-1 text-3xl">{view.answer.name}</p>
          <p className="mt-1 text-sm text-muted">{view.answer.nationality}</p>
          <p className="mt-3 display text-2xl text-green">+{view.points}</p>
        </div>
      )}

      <CareerTimeline revealed={view.revealed} clubCount={view.clubCount} />

      <div className="mt-5 flex items-center justify-center gap-1.5">
        {Array.from({ length: view.clubCount }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${
              i < view.movesUsed ? "bg-red" : "bg-white/15"
            }`}
          />
        ))}
      </div>

      {!view.finished ? (
        <div className="mt-5 space-y-3">
          <PlayerSearch
            players={players}
            exclude={guessedIds}
            disabled={busy}
            onPick={onPick}
          />
          <div className="text-center">
            <button
              type="button"
              className="btn"
              onClick={onSkip}
              disabled={busy}
            >
              Skip
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-3">
          {view.mode === "practice" ? (
            <button type="button" className="btn" onClick={onNext} disabled={busy}>
              Play next
            </button>
          ) : (
            <Link href="/games" className="btn">
              See leaderboard
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 space-y-2">
        {[...view.guesses].reverse().map((g) => (
          <GuessRow
            key={g.playerId}
            name={g.name}
            comparison={g.comparison}
            crests={crests}
          />
        ))}
      </div>
    </div>
  );
}
