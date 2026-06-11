import type { Comparison, Chip } from "@/lib/games/compare";

function ChipBox({
  chip,
  children,
}: {
  chip: Chip;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`flex h-9 min-w-9 items-center justify-center gap-0.5 rounded-full px-2 text-[10px] font-bold uppercase ${
        chip.match ? "bg-green/25 text-green" : "bg-red/20 text-red"
      }`}
    >
      {children}
    </span>
  );
}

/** One guessed player with the five comparison chips. */
export function GuessRow({
  name,
  comparison,
  crests,
}: {
  name: string;
  comparison: Comparison;
  crests: Record<string, string>;
}) {
  const nat = String(comparison.nationality.value ?? "");
  const crest = crests[nat];
  return (
    <div className="surface flex items-center gap-2 p-2">
      <span className="flex-1 truncate pl-1 text-sm font-bold">{name}</span>
      <ChipBox chip={comparison.nationality}>
        {crest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={crest} alt={nat} className="h-4 w-4 rounded-full object-cover" />
        ) : (
          nat.slice(0, 3)
        )}
      </ChipBox>
      <ChipBox chip={comparison.league}>
        {String(comparison.league.value ?? "—").slice(0, 4)}
      </ChipBox>
      <ChipBox chip={comparison.currentClub}>
        {String(comparison.currentClub.value ?? "—").slice(0, 4)}
      </ChipBox>
      <ChipBox chip={comparison.position}>{String(comparison.position.value ?? "")}</ChipBox>
      <ChipBox chip={comparison.age}>
        {comparison.age.value}
        {comparison.age.direction === "up" ? "↑" : comparison.age.direction === "down" ? "↓" : ""}
      </ChipBox>
    </div>
  );
}
