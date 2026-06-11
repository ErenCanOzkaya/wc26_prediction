import type { RevealedClub } from "@/lib/games/career";

/** Shows revealed clubs as crest circles + year; hidden future clubs as "?". */
export function CareerTimeline({
  revealed,
  clubCount,
}: {
  revealed: RevealedClub[];
  clubCount: number;
}) {
  const hidden = Math.max(0, clubCount - revealed.length);
  return (
    <div className="flex flex-wrap items-start justify-center gap-x-2 gap-y-4">
      {revealed.map((c, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/8">
            {c.isLoan && (
              <span className="absolute -top-2 rounded bg-sand px-1 text-[9px] font-bold text-bg">
                Loan
              </span>
            )}
            {c.clubLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.clubLogoUrl} alt={c.club} className="h-9 w-9 object-contain" />
            ) : (
              <span className="px-1 text-center text-[9px] leading-tight text-muted">
                {c.club}
              </span>
            )}
          </div>
          <span className="display text-xs">{c.startYear ?? "?"}</span>
        </div>
      ))}
      {Array.from({ length: hidden }).map((_, i) => (
        <div key={`h${i}`} className="flex flex-col items-center gap-1">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5 text-xl font-bold text-muted">
            ?
          </div>
          <span className="display text-xs text-muted">·</span>
        </div>
      ))}
    </div>
  );
}
