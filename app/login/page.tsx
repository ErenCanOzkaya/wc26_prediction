"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Motif26 } from "@/components/Motif26";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const redirectTo =
    typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : undefined;

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
      setMessage(`Magic link sent to ${email}. Check your inbox.`);
    }
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
  }

  return (
    <main className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden p-6">
      {/* Decorative geometric blocks */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 top-10 h-72 w-72 rounded-[3rem] bg-navy/30 blur-3xl" />
        <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-green/20 blur-3xl" />
        <div className="absolute right-1/4 top-1/3 h-40 w-40 rounded-[2rem] bg-navy/20 blur-2xl" />
      </div>

      <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
        <div className="rise">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-green">
            <span className="h-1.5 w-1.5 rounded-full bg-green" /> June 2026
          </span>
          <h1 className="display mt-5 text-6xl text-fg sm:text-7xl">
            WE ARE
            <br />
            <span className="text-green">26</span>
          </h1>
          <p className="mt-4 max-w-sm text-lg text-muted">
            Predict the 2026 World Cup. Build your bracket. Compete with friends
            in private leagues.
          </p>
        </div>

        <div
          className="surface rise relative overflow-hidden p-7"
          style={{ animationDelay: "120ms" }}
        >
          <Motif26 className="absolute -right-5 -top-8 scale-75 opacity-40" />
          <h2 className="display text-2xl">Sign in</h2>
          <p className="mt-1 mb-5 text-sm text-muted">
            No password — we’ll email you a magic link.
          </p>

          <form onSubmit={signInWithEmail} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="field"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="btn btn-primary w-full"
            >
              {status === "sending" ? "Sending…" : "Email me a magic link"}
            </button>
          </form>

          <div className="my-4 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-white/10" /> or
            <span className="h-px flex-1 bg-white/10" />
          </div>

          <button onClick={signInWithGoogle} className="btn btn-ghost w-full">
            Continue with Google
          </button>

          {message && (
            <p
              className={`mt-4 text-sm ${
                status === "error" ? "text-red" : "text-green"
              }`}
            >
              {message}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
