import Link from "next/link";
import { CountdownTimer } from "@/components/CountdownTimer";
import { ProfileCard, type CountryOption } from "@/components/ProfileCard";

export function AppHeader({
  displayName,
  countdownTarget,
  countdownCaption,
  countdownLabel,
  points,
  leagues,
  country,
  countries,
}: {
  displayName: string;
  countdownTarget: string | null;
  countdownCaption?: string;
  countdownLabel?: string | null;
  points: number;
  leagues: number;
  country: CountryOption | null;
  countries: CountryOption[];
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/8 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="group flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-green text-bg">
            <span className="display text-sm leading-none">26</span>
          </span>
          <span className="display text-xl tracking-tight">
            wc<span className="text-green">26</span>
          </span>
        </Link>

        <CountdownTimer
          targetIso={countdownTarget}
          caption={countdownCaption}
          matchLabel={countdownLabel}
        />

        <ProfileCard
          displayName={displayName}
          points={points}
          leagues={leagues}
          country={country}
          countries={countries}
        />
      </div>
    </header>
  );
}
