"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BRACKET,
  BRACKET_COLUMNS,
  type BracketMatch,
} from "@/lib/bracket/structure";
import { saveBracket } from "@/lib/predictions/actions";
import type { TeamLite } from "@/components/MatchPredictionRow";
import type { GroupResolved } from "@/app/(app)/predictions/bracket/page";

type Entrant = TeamLite | null;

// ---- Geometry: concentric rings, outermost = Round of 32, centre = champion.
const C = 360; // svg centre (viewBox 720x720)
const RINGS: { stage: keyof typeof STAGE_MATCHES; rOuter: number; rInner: number }[] = [
  { stage: "r32", rOuter: 350, rInner: 288 },
  { stage: "r16", rOuter: 284, rInner: 230 },
  { stage: "qf", rOuter: 226, rInner: 176 },
  { stage: "sf", rOuter: 172, rInner: 124 },
  { stage: "final", rOuter: 120, rInner: 74 },
];
const CHAMP_R = 66;

// palette (hex, for SVG fills)
const HEX = {
  green: "#4fb053",
  navy: "#4548d4",
  red: "#e8473a",
  sand: "#d3d3cf",
  bg: "#16191d",
  fg: "#f2f1ec",
  empty: "#222731",
};
const HUES = [HEX.green, HEX.navy, HEX.red, HEX.sand];

const STAGE_MATCHES = {
  r32: BRACKET_COLUMNS.r32, // 16 matches
  r16: BRACKET_COLUMNS.r16, // 8
  qf: BRACKET_COLUMNS.qf, // 4
  sf: BRACKET_COLUMNS.sf, // 2
  final: [104], // 1
};

function mix(aHex: string, bHex: string, t: number): string {
  const a = parseInt(aHex.slice(1), 16);
  const b = parseInt(bHex.slice(1), 16);
  const ar = (a >> 16) & 255,
    ag = (a >> 8) & 255,
    ab = a & 255;
  const br = (b >> 16) & 255,
    bg = (b >> 8) & 255,
    bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1)}`;
}

function polar(r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function sectorPath(rI: number, rO: number, a0: number, a1: number): string {
  const [x0o, y0o] = polar(rO, a0);
  const [x1o, y1o] = polar(rO, a1);
  const [x1i, y1i] = polar(rI, a1);
  const [x0i, y0i] = polar(rI, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0o} ${y0o} A ${rO} ${rO} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rI} ${rI} 0 ${large} 0 ${x0i} ${y0i} Z`;
}

export function BracketBuilder({
  groups,
  teams,
  locked,
  initialWinners,
  initialThirds,
}: {
  groups: Record<string, GroupResolved>;
  teams: TeamLite[];
  locked: boolean;
  initialWinners: Record<number, number>;
  initialThirds: Record<number, number>;
}) {
  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const [winners, setWinners] = useState<Record<number, number>>(initialWinners);
  const [thirds, setThirds] = useState<Record<number, number>>(initialThirds);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const { entrants, effWinner } = useMemo(() => {
    const entrants = new Map<number, { a: Entrant; b: Entrant }>();
    const effWinner = new Map<number, number | undefined>();
    const sideTeam = (m: BracketMatch, which: "a" | "b"): Entrant => {
      const src = m[which];
      switch (src.type) {
        case "winner":
          return groups[src.group]?.winner ?? null;
        case "runnerup":
          return groups[src.group]?.runnerup ?? null;
        case "third": {
          const tid = thirds[m.match];
          return tid ? (teamsById.get(tid) ?? null) : null;
        }
        case "winnerOf": {
          const tid = effWinner.get(src.match);
          return tid ? (teamsById.get(tid) ?? null) : null;
        }
      }
    };
    for (const m of [...BRACKET].sort((x, y) => x.match - y.match)) {
      const a = sideTeam(m, "a");
      const b = sideTeam(m, "b");
      entrants.set(m.match, { a, b });
      const w = winners[m.match];
      effWinner.set(m.match, w === a?.id || w === b?.id ? w : undefined);
    }
    return { entrants, effWinner };
  }, [groups, teamsById, winners, thirds]);

  function pickWinner(match: number, teamId: number) {
    if (locked) return;
    setWinners((p) => ({ ...p, [match]: teamId }));
  }
  function pickThird(match: number, teamId: number | null) {
    if (locked) return;
    setThirds((p) => {
      const next = { ...p };
      if (teamId == null) delete next[match];
      else next[match] = teamId;
      return next;
    });
  }

  function save() {
    start(async () => {
      const winnerRows = [...effWinner.entries()]
        .filter(([m, t]) => t != null && m !== 103)
        .map(([m, t]) => ({ match: m, teamId: t as number }));
      const thirdRows = Object.entries(thirds).map(([m, t]) => ({
        match: Number(m),
        teamId: t,
      }));
      const res = await saveBracket({ winners: winnerRows, thirds: thirdRows });
      if (res.error) {
        setStatus("error");
        setMsg(res.error);
      } else {
        setStatus("ok");
        setMsg("Bracket saved.");
      }
    });
  }

  function thirdCandidates(m: BracketMatch): TeamLite[] {
    const src = m.b.type === "third" ? m.b : null;
    if (!src) return [];
    const excludeGroup =
      m.a.type === "winner" || m.a.type === "runnerup" ? m.a.group : null;
    const usedElsewhere = new Set(
      Object.entries(thirds)
        .filter(([mm]) => Number(mm) !== m.match)
        .map(([, t]) => t),
    );
    return src.groups
      .filter((g) => g !== excludeGroup)
      .map((g) => groups[g]?.third)
      .filter((t): t is TeamLite => !!t)
      .filter((t) => !usedElsewhere.has(t.id) || thirds[m.match] === t.id);
  }

  const champion = effWinner.get(104) ? teamsById.get(effWinner.get(104)!) : null;
  const finalA = entrants.get(104)?.a ?? null;
  const finalB = entrants.get(104)?.b ?? null;
  const name = (t: Entrant) => (t ? t.short_name || t.name : "—");
  const thirdMatches = BRACKET.filter((m) => m.b.type === "third");

  // Build all clickable segments across rings.
  const GAP = 0.6; // angular padding (deg)
  type Seg = {
    key: string;
    path: string;
    fill: string;
    stroke: string;
    team: Entrant;
    cx: number;
    cy: number;
    crestR: number;
    onClick?: () => void;
  };
  const segs: Seg[] = [];
  for (const ring of RINGS) {
    const list = STAGE_MATCHES[ring.stage];
    const segCount = list.length * 2;
    const step = 360 / segCount;
    for (let s = 0; s < segCount; s++) {
      const matchNo = list[Math.floor(s / 2)];
      const side: "a" | "b" = s % 2 === 0 ? "a" : "b";
      const e = entrants.get(matchNo)!;
      const team = e[side];
      const isWin = !!team && effWinner.get(matchNo) === team.id;
      const a0 = s * step + GAP;
      const a1 = (s + 1) * step - GAP;
      const hue = HUES[Math.floor(s / 2) % HUES.length];
      const fill = team
        ? isWin
          ? mix(hue, HEX.fg, 0.12)
          : mix(hue, HEX.bg, 0.62)
        : HEX.empty;
      const midR = (ring.rOuter + ring.rInner) / 2;
      const [cx, cy] = polar(midR, (a0 + a1) / 2);
      segs.push({
        key: `${ring.stage}-${s}`,
        path: sectorPath(ring.rInner, ring.rOuter, a0, a1),
        fill,
        stroke: isWin ? HEX.green : HEX.bg,
        team,
        cx,
        cy,
        crestR: Math.min(13, (ring.rOuter - ring.rInner) / 2.6),
        onClick:
          team && !locked ? () => pickWinner(matchNo, team.id) : undefined,
      });
    }
  }

  return (
    <div>
      {/* Path-to-glory summary */}
      <div className="surface mb-5 flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              Your champion
            </div>
            <div className="display mt-1 flex items-center gap-2 text-3xl text-green">
              {champion?.crest_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={champion.crest_url} alt="" className="h-6 w-6" />
              )}
              {champion ? champion.short_name || champion.name : "—"}
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
              Final
            </div>
            <div className="mt-1 text-lg font-bold">
              {name(finalA)} <span className="text-muted">vs</span>{" "}
              {name(finalB)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status !== "idle" && (
            <span className={status === "error" ? "text-red" : "text-green"}>
              {msg}
            </span>
          )}
          {locked ? (
            <span className="text-sm text-muted">Bracket locked.</span>
          ) : (
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="btn btn-primary"
            >
              {pending ? "Saving…" : "Save bracket"}
            </button>
          )}
        </div>
      </div>

      {/* Third-placed entrants picker (awkward inside the wheel, so up here) */}
      {!locked && (
        <div className="mb-5">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
            Round-of-32 · third-placed entrants
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {thirdMatches.map((m) => {
              const opp = entrants.get(m.match)?.a;
              return (
                <label key={m.match} className="block">
                  <span className="mb-1 block text-[10px] text-muted">
                    vs {name(opp ?? null)} · M{m.match}
                  </span>
                  <select
                    value={thirds[m.match] ?? ""}
                    onChange={(e) =>
                      pickThird(
                        m.match,
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    className="field !py-2 text-sm"
                  >
                    <option value="">Pick 3rd…</option>
                    {thirdCandidates(m).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.short_name || t.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        </div>
      )}

      <p className="mb-3 text-center text-xs text-muted">
        Click a team to send it inward. The centre is your champion.
      </p>

      {/* Radial bracket */}
      <div className="mx-auto max-w-[620px]">
        <svg viewBox="0 0 720 720" className="w-full">
          {segs.map((seg) => (
            <g
              key={seg.key}
              onClick={seg.onClick}
              style={{ cursor: seg.onClick ? "pointer" : "default" }}
            >
              <title>{name(seg.team)}</title>
              <path d={seg.path} fill={seg.fill} stroke={seg.stroke} strokeWidth={2} />
              {seg.team?.crest_url && (
                <image
                  href={seg.team.crest_url}
                  x={seg.cx - seg.crestR}
                  y={seg.cy - seg.crestR}
                  width={seg.crestR * 2}
                  height={seg.crestR * 2}
                  preserveAspectRatio="xMidYMid meet"
                  style={{ pointerEvents: "none" }}
                />
              )}
            </g>
          ))}

          {/* Champion centre */}
          <circle
            cx={C}
            cy={C}
            r={CHAMP_R}
            fill={champion ? mix(HEX.green, HEX.bg, 0.35) : HEX.empty}
            stroke={champion ? HEX.green : HEX.bg}
            strokeWidth={2}
          />
          {champion?.crest_url ? (
            <image
              href={champion.crest_url}
              x={C - 22}
              y={C - 26}
              width={44}
              height={44}
              preserveAspectRatio="xMidYMid meet"
              style={{ pointerEvents: "none" }}
            />
          ) : (
            <text
              x={C}
              y={C + 6}
              textAnchor="middle"
              fill={HEX.fg}
              fontSize="22"
              fontWeight="800"
            >
              26
            </text>
          )}
          {champion && (
            <text
              x={C}
              y={C + 34}
              textAnchor="middle"
              fill={HEX.fg}
              fontSize="13"
              fontWeight="700"
            >
              {champion.short_name || champion.name}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
