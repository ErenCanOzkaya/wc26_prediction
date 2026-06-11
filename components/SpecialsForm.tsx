"use client";

import { useState, useTransition } from "react";
import { saveSpecials } from "@/lib/predictions/actions";
import { PlayerCombobox, type PlayerLite } from "@/components/PlayerCombobox";

export function SpecialsForm({
  players,
  locked,
  initial,
}: {
  players: PlayerLite[];
  locked: boolean;
  initial: {
    goldenBootId: number | null;
    bestPlayerId: number | null;
    bestYoungId: number | null;
  };
}) {
  const [goldenBootId, setGolden] = useState(initial.goldenBootId);
  const [bestPlayerId, setBest] = useState(initial.bestPlayerId);
  const [bestYoungId, setYoung] = useState(initial.bestYoungId);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const res = await saveSpecials({ goldenBootId, bestPlayerId, bestYoungId });
      if (res.error) {
        setStatus("error");
        setMsg(res.error);
      } else {
        setStatus("ok");
        setMsg("Saved.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <PlayerCombobox
        label="Golden Boot"
        hint="Top scorer · +15"
        accent="var(--color-red)"
        players={players}
        value={goldenBootId}
        onChange={setGolden}
        disabled={locked}
      />
      <PlayerCombobox
        label="Best Player"
        hint="Optional · +10 · resolved by the admin at the end"
        accent="var(--color-navy)"
        players={players}
        value={bestPlayerId}
        onChange={setBest}
        disabled={locked}
      />
      <PlayerCombobox
        label="Best Young Player"
        hint="Optional · ≤21 at start · +10"
        accent="var(--color-green)"
        players={players}
        value={bestYoungId}
        onChange={setYoung}
        disabled={locked}
        eligibleYoungOnly
      />

      {!locked && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="btn btn-primary"
          >
            {pending ? "Saving…" : "Save specials"}
          </button>
          {status !== "idle" && (
            <span
              className={`text-sm ${
                status === "error" ? "text-red" : "text-green"
              }`}
            >
              {msg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
