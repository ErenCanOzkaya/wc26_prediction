import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Single seam between the app and the football data provider (API.md §3).
 * The app NEVER calls the provider directly — only server code through this
 * module. Swapping providers for v2 fantasy means implementing FootballProvider
 * again; nothing else changes.
 */

// ---- Provider domain types (mirror football-data.org v4, but typed) ----

export interface Competition {
  id: number;
  code: string;
  name: string;
  seasonStart: string; // ISO date
  seasonEnd: string; // ISO date
  currentMatchday: number | null;
}

export type ProviderStage =
  | "GROUP_STAGE"
  | "LAST_32"
  | "LAST_16"
  | "QUARTER_FINALS"
  | "SEMI_FINALS"
  | "THIRD_PLACE"
  | "FINAL";

export type ProviderStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "AWARDED"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED";

export type ProviderWinner = "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
export type ProviderDuration = "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";

export interface ProviderTeamRef {
  id: number | null; // null until a knockout slot resolves
  name: string | null;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
}

export interface ProviderScore {
  winner: ProviderWinner; // post-penalties winner for knockout
  duration: ProviderDuration;
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
}

export interface ProviderMatch {
  id: number;
  stage: ProviderStage;
  group: string | null; // "GROUP_A".."GROUP_L", null for knockout
  matchday: number | null;
  utcDate: string; // ISO timestamp
  venue: string | null;
  status: ProviderStatus;
  homeTeam: ProviderTeamRef;
  awayTeam: ProviderTeamRef;
  score: ProviderScore;
}

export interface ProviderStandingRow {
  position: number;
  teamId: number;
  teamName: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface ProviderStanding {
  group: string; // "Group A"
  rows: ProviderStandingRow[];
}

export interface ProviderScorer {
  playerId: number;
  playerName: string;
  teamId: number | null;
  goals: number;
  assists: number | null;
}

export interface ProviderPlayer {
  id: number;
  name: string;
  position: string | null;
  dateOfBirth: string | null; // ISO date
}

export interface ProviderTeam {
  id: number;
  name: string;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
  squad: ProviderPlayer[];
}

export interface FootballProvider {
  getCompetition(): Promise<Competition>;
  getMatches(): Promise<ProviderMatch[]>;
  getStandings(): Promise<ProviderStanding[]>;
  getScorers(limit?: number): Promise<ProviderScorer[]>;
  getTeams(): Promise<ProviderTeam[]>;
  getMatch(id: number): Promise<ProviderMatch>;
}

// ---- football-data.org implementation ----

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Rate-limit-aware GET. Free tier = 10 req/min. On HTTP 429 we wait for the
 * window to reset (X-RequestCounter-Reset, seconds) and retry a couple of times.
 * Normal operation never sleeps.
 */
async function fdFetch<T>(path: string, retries = 2): Promise<T> {
  const { footballBase, footballApiKey } = serverEnv();
  const url = `${footballBase}${path}`;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "X-Auth-Token": footballApiKey },
      cache: "no-store",
    });

    if (res.status === 429 && attempt < retries) {
      const reset = Number(res.headers.get("x-requestcounter-reset") ?? "60");
      await sleep((Number.isFinite(reset) ? reset : 60) * 1000 + 500);
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`football-data GET ${path} -> ${res.status} ${body}`);
    }
    return (await res.json()) as T;
  }
}

// ---- raw response shapes (only the fields we read) ----

interface RawTeamRef {
  id: number | null;
  name: string | null;
  shortName: string | null;
  tla: string | null;
  crest: string | null;
}
interface RawMatch {
  id: number;
  stage: ProviderStage;
  group: string | null;
  matchday: number | null;
  utcDate: string;
  venue: string | null;
  status: ProviderStatus;
  homeTeam: RawTeamRef;
  awayTeam: RawTeamRef;
  score: ProviderScore;
}

function mapMatch(m: RawMatch): ProviderMatch {
  return {
    id: m.id,
    stage: m.stage,
    group: m.group,
    matchday: m.matchday,
    utcDate: m.utcDate,
    venue: m.venue ?? null,
    status: m.status,
    homeTeam: m.homeTeam,
    awayTeam: m.awayTeam,
    score: m.score,
  };
}

export const footballDataProvider: FootballProvider = {
  async getCompetition() {
    const { wcCompetitionCode } = serverEnv();
    const d = await fdFetch<{
      id: number;
      code: string;
      name: string;
      currentSeason: {
        startDate: string;
        endDate: string;
        currentMatchday: number | null;
      };
    }>(`/competitions/${wcCompetitionCode}`);
    return {
      id: d.id,
      code: d.code,
      name: d.name,
      seasonStart: d.currentSeason.startDate,
      seasonEnd: d.currentSeason.endDate,
      currentMatchday: d.currentSeason.currentMatchday,
    };
  },

  async getMatches() {
    const { wcCompetitionCode } = serverEnv();
    const d = await fdFetch<{ matches: RawMatch[] }>(
      `/competitions/${wcCompetitionCode}/matches`,
    );
    return d.matches.map(mapMatch);
  },

  async getStandings() {
    const { wcCompetitionCode } = serverEnv();
    const d = await fdFetch<{
      standings: Array<{
        type: string;
        group: string | null;
        table: Array<{
          position: number;
          team: { id: number; name: string };
          playedGames: number;
          won: number;
          draw: number;
          lost: number;
          points: number;
          goalsFor: number;
          goalsAgainst: number;
          goalDifference: number;
        }>;
      }>;
    }>(`/competitions/${wcCompetitionCode}/standings`);

    return d.standings
      .filter((s) => s.type === "TOTAL" && s.group)
      .map((s) => ({
        group: s.group as string,
        rows: s.table.map((r) => ({
          position: r.position,
          teamId: r.team.id,
          teamName: r.team.name,
          played: r.playedGames,
          won: r.won,
          draw: r.draw,
          lost: r.lost,
          points: r.points,
          goalsFor: r.goalsFor,
          goalsAgainst: r.goalsAgainst,
          goalDifference: r.goalDifference,
        })),
      }));
  },

  async getScorers(limit = 30) {
    const { wcCompetitionCode } = serverEnv();
    const d = await fdFetch<{
      scorers: Array<{
        player: { id: number; name: string };
        team: { id: number | null } | null;
        goals: number | null;
        assists: number | null;
      }>;
    }>(`/competitions/${wcCompetitionCode}/scorers?limit=${limit}`);

    return d.scorers.map((s) => ({
      playerId: s.player.id,
      playerName: s.player.name,
      teamId: s.team?.id ?? null,
      goals: s.goals ?? 0,
      assists: s.assists ?? null,
    }));
  },

  async getTeams() {
    const { wcCompetitionCode } = serverEnv();
    const d = await fdFetch<{
      teams: Array<{
        id: number;
        name: string;
        shortName: string | null;
        tla: string | null;
        crest: string | null;
        squad: Array<{
          id: number;
          name: string;
          position: string | null;
          dateOfBirth: string | null;
        }>;
      }>;
    }>(`/competitions/${wcCompetitionCode}/teams`);

    return d.teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      tla: t.tla,
      crest: t.crest,
      squad: (t.squad ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        position: p.position,
        dateOfBirth: p.dateOfBirth,
      })),
    }));
  },

  async getMatch(id: number) {
    const d = await fdFetch<RawMatch>(`/matches/${id}`);
    return mapMatch(d);
  },
};
