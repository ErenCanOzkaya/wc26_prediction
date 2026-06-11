"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createLeague, joinLeague } from "@/lib/leagues/actions";

export function LeagueForms() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [created, setCreated] = useState<{ name: string; invite_code: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const res = await createLeague(name);
      if (res.error) setError(res.error);
      else {
        setCreated(res.league!);
        setName("");
        router.refresh();
      }
    });
  }

  function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    start(async () => {
      const res = await joinLeague(code);
      if (res.error) setError(res.error);
      else {
        setCode("");
        router.push(`/leagues/${res.league!.id}`);
      }
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <form
        onSubmit={onCreate}
        className="rounded-xl border border-white/12 bg-white/5 p-5"
      >
        <h2 className="font-display text-lg font-semibold">Create a league</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="League name"
            className="flex-1 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm focus:border-green focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Create
          </button>
        </div>
        {created && (
          <p className="mt-3 text-sm text-green">
            “{created.name}” created. Invite code:{" "}
            <span className="font-mono font-bold tracking-widest">
              {created.invite_code}
            </span>
          </p>
        )}
      </form>

      <form
        onSubmit={onJoin}
        className="rounded-xl border border-white/12 bg-white/5 p-5"
      >
        <h2 className="font-display text-lg font-semibold">Join a league</h2>
        <div className="mt-3 flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            className="flex-1 rounded-lg border border-white/12 bg-white/5 px-3 py-2 text-sm font-mono tracking-widest focus:border-green focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-green px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Join
          </button>
        </div>
      </form>

      {error && (
        <p className="text-sm text-red sm:col-span-2">{error}</p>
      )}
    </div>
  );
}
