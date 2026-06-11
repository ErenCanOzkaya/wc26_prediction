import type { RevealedClub } from "@/lib/games/career";

/**
 * Big crest circles for revealed clubs (logo + name + year). Still-hidden spells
 * show "?" with their transfer year underneath as a hint.
 */
export function CareerTimeline({
  revealed,
  hiddenYears,
}: {
  revealed: RevealedClub[];
  hiddenYears: (number | null)[];
}) {
  return (
    <div className="flex flex-wrap items-start justify-center gap-x-3 gap-y-5">
      {revealed.map((c, i) => (
        <div key={i} className="flex w-20 flex-col items-center gap-1.5">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white/8">
            {c.isLoan && (
              <span className="absolute -top-2 z-10 rounded bg-sand px-1.5 py-0.5 text-[9px] font-bold text-bg">
                Loan
              </span>
            )}
            {c.clubLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.clubLogoUrl}
                alt={c.club}
                className="h-12 w-12 object-contain"
              />
            ) : (
              <span className="px-1 text-center text-[10px] font-bold leading-tight">
                {c.club.slice(0, 16)}
              </span>
            )}
          </div>
          <span className="line-clamp-2 h-7 text-center text-[11px] font-medium leading-tight">
            {c.club}
          </span>
          <span className="display text-base">{c.startYear ?? "?"}</span>
        </div>
      ))}
      {hiddenYears.map((y, i) => (
        <div key={`h${i}`} className="flex w-20 flex-col items-center gap-1.5">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/5 text-3xl font-bold text-muted">
            ?
          </div>
          <span className="h-7" />
          <span className="display text-base text-muted">{y ?? "·"}</span>
        </div>
      ))}
    </div>
  );
}
