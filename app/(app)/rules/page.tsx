import { SCORING_CONFIG as C } from "@/lib/scoring/config";

export const metadata = { title: "How scoring works — wc26-league" };

function Row({ label, pts }: { label: string; pts: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/6 py-2 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="display text-lg" style={{ color: "var(--color-green)" }}>
        {pts}
      </span>
    </div>
  );
}

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface relative overflow-hidden p-5">
      <span
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: accent }}
      />
      <h2 className="display mb-3 pt-0.5 text-xl">{title}</h2>
      {children}
    </div>
  );
}

const STAGES = [
  ["Round of 32 (qualified)", C.bracket.r32],
  ["Round of 16", C.bracket.r16],
  ["Quarter-final", C.bracket.qf],
  ["Semi-final", C.bracket.sf],
  ["Final", C.bracket.final],
  ["Champion", C.bracket.champion],
] as const;

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display rise text-6xl leading-[0.9] sm:text-7xl">
        HOW IT
        <br />
        <span className="text-green">SCORES</span>
      </h1>
      <p className="mt-3 mb-6 max-w-lg text-sm text-muted">
        One global prediction set, scored deterministically across every league.
        You earn points across five categories — the bracket and champion carry
        the high-variance upside that can win a league on their own.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Match scores" accent="var(--color-green)">
          <p className="mb-2 text-xs text-muted">
            Per match (group & knockout). Only the single highest tier counts.
          </p>
          <Row label="Exact score" pts={`${C.match.exactScore}`} />
          <Row
            label="Right result & margin, wrong score"
            pts={`${C.match.correctResultAndMargin}`}
          />
          <Row label="Right draw, wrong score" pts={`${C.match.correctDraw}`} />
          <Row label="Right winner only" pts={`${C.match.correctWinnerOnly}`} />
          <Row label="Wrong" pts="0" />
          {C.match.perfectMatchdayBonusEnabled && (
            <Row
              label="Perfect matchday (all outcomes on a day)"
              pts={`+${C.match.perfectMatchdayBonus}`}
            />
          )}
        </Section>

        <Section title="Group standings" accent="var(--color-navy)">
          <p className="mb-2 text-xs text-muted">
            Per group, scored on the final table (max 15).
          </p>
          <Row
            label="Each team in its exact position"
            pts={`+${C.group.exactPositionPerTeam} ea (max 8)`}
          />
          <Row
            label="Correct top-2 set (order-agnostic)"
            pts={`+${C.group.correctTop2Set}`}
          />
          <Row label="Perfect group (all 4 exact)" pts={`+${C.group.perfectGroupBonus}`} />
        </Section>

        <Section title="Bracket" accent="var(--color-red)">
          <p className="mb-2 text-xs text-muted">
            Cumulative: a team earns each stage it reaches that you also predicted.
            A perfect bracket is worth ~287.
          </p>
          {STAGES.map(([label, s]) => (
            <Row
              key={label}
              label={label}
              pts={s.slotBonus ? `${s.base} (+${s.slotBonus} exact path)` : `${s.base}`}
            />
          ))}
        </Section>

        <Section title="Tournament specials" accent="var(--color-sand)">
          <p className="mb-2 text-xs text-muted">
            Locked at the opening kickoff.
          </p>
          <Row label="Golden Boot (top scorer)" pts={`+${C.specials.goldenBoot}`} />
          <Row label="Best Player (admin)" pts={`+${C.specials.bestPlayer}`} />
          <Row
            label={`Best Young Player (≤${C.specials.youngPlayerMaxAge})`}
            pts={`+${C.specials.bestYoungPlayer}`}
          />
        </Section>

        <Section title="Tournament XI" accent="var(--color-green)">
          <p className="mb-2 text-xs text-muted">
            Pick the 11 players for the tournament’s Golden XI + a captain.
          </p>
          <Row label="Each correct player" pts={`+${C.xi.perPlayer}`} />
          <Row label="Captain in the XI" pts={`+${C.xi.captainBonus}`} />
          {C.xi.thresholds.map((t) => (
            <Row key={t.correct} label={`${t.correct} / 11 correct`} pts={`+${t.bonus}`} />
          ))}
        </Section>
      </div>

      <div className="surface mt-4 p-5 text-sm text-muted">
        <h2 className="display mb-2 text-lg text-fg">Locks</h2>
        Group order locks at that group’s first kickoff. A match score locks at
        kickoff. The bracket locks at the first Round-of-32 kickoff (one edit
        window after the group stage). Specials lock at the opening kickoff. Your
        league-mates can see your picks as soon as you make them.
      </div>
    </div>
  );
}
