"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteLeague, leaveLeague } from "@/lib/leagues/actions";

export function LeagueActions({
  leagueId,
  isOwner,
}: {
  leagueId: string;
  isOwner: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");

  function onClick() {
    const ok = window.confirm(
      isOwner
        ? "Delete this league for everyone? This can’t be undone."
        : "Leave this league?",
    );
    if (!ok) return;
    setErr("");
    start(async () => {
      const res = isOwner
        ? await deleteLeague(leagueId)
        : await leaveLeague(leagueId);
      if (res.error) setErr(res.error);
      else router.push("/leagues");
    });
  }

  return (
    <div className="flex items-center gap-2">
      {err && <span className="text-xs text-red">{err}</span>}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-full border border-red/40 px-3 py-1.5 text-xs font-bold text-red transition hover:bg-red/10 disabled:opacity-50"
      >
        {pending
          ? "…"
          : isOwner
            ? "Delete league"
            : "Leave league"}
      </button>
    </div>
  );
}
