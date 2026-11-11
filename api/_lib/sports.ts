// Sports data tools the model can call.
//
// Default source: TheSportsDB (https://www.thesportsdb.com), which covers
// football, basketball, ice hockey, baseball, rugby, motorsport and more.
// The free test key "3" works but is rate-limited and some endpoints return
// partial data; set SPORTSDB_KEY to a paid key for full coverage.
//
// Optional: set SPORTS_API_URL (+ SPORTS_API_KEY) to add your own API as an
// extra tool, e.g. the one from the curl you already have.
import type { Tool, ToolArgs } from "./types";

const SPORTSDB_KEY = process.env.SPORTSDB_KEY || "3";
const SPORTSDB_BASE = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}`;

type Row = Record<string, unknown>;

async function sportsDb(path: string, params: Record<string, string>): Promise<Row> {
  const url = new URL(`${SPORTSDB_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TheSportsDB returned ${res.status}`);
  return (await res.json()) as Row;
}

// Keep only the fields the model needs so we don't flood its context.
function pick(rows: unknown, fields: string[], limit = 10): Row[] {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, limit).map((row: Row) => {
    const out: Row = {};
    for (const f of fields) {
      const v = row[f];
      if (v === null || v === undefined || v === "") continue;
      out[f] = typeof v === "string" && v.length > 400 ? v.slice(0, 400) + "..." : v;
    }
    return out;
  });
}

function str(args: ToolArgs, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || !v.trim()) throw new Error(`Missing argument: ${key}`);
  return v.trim();
}

const EVENT_FIELDS = [
  "strEvent", "dateEvent", "strTime", "strLeague", "strSeason",
  "strHomeTeam", "strAwayTeam", "intHomeScore", "intAwayScore", "strVenue", "strStatus",
];

const searchTeam: Tool = {
  definition: {
    type: "function",
    function: {
      name: "search_team",
      description:
        "Find a team or club in any sport. Returns its id, league id, country, stadium and a short description. Call this first to get ids for the other tools.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Team name, e.g. 'Al Ahly', 'Lakers'" } },
        required: ["name"],
      },
    },
  },
  async run(args) {
    const data = await sportsDb("searchteams.php", { t: str(args, "name") });
    const teams = pick(data.teams, [
      "idTeam", "strTeam", "strSport", "strLeague", "idLeague", "strCountry",
      "strStadium", "intFormedYear", "strDescriptionEN",
    ], 5);
    return teams.length ? { teams } : { error: "No team found with that name." };
  },
};

const teamEvents: Tool = {
  definition: {
    type: "function",
    function: {
      name: "team_events",
      description: "Get a team's most recent results or upcoming fixtures, using the idTeam from search_team.",
      parameters: {
        type: "object",
        properties: {
          team_id: { type: "string", description: "idTeam from search_team" },
          when: { type: "string", enum: ["last", "next"], description: "'last' for results, 'next' for fixtures" },
        },
        required: ["team_id", "when"],
      },
    },
  },
  async run(args) {
    const id = str(args, "team_id");
    const next = args.when === "next";
    const data = await sportsDb(next ? "eventsnext.php" : "eventslast.php", { id });
    const events = pick(next ? data.events : data.results, EVENT_FIELDS);
    return events.length ? { events } : { error: "No events returned for this team." };
  },
};

const leagueTable: Tool = {
  definition: {
    type: "function",
    function: {
      name: "league_table",
      description: "Get the standings for a league and season, using the idLeague from search_team.",
      parameters: {
        type: "object",
        properties: {
          league_id: { type: "string", description: "idLeague from search_team" },
          season: { type: "string", description: "Season, e.g. '2025-2026' for football or '2026' for single-year leagues" },
        },
        required: ["league_id", "season"],
      },
    },
  },
  async run(args) {
    const data = await sportsDb("lookuptable.php", { l: str(args, "league_id"), s: str(args, "season") });
    const table = pick(data.table, [
      "intRank", "strTeam", "intPlayed", "intWin", "intDraw", "intLoss",
      "intGoalDifference", "intPoints", "strForm",
    ], 30);
    return table.length ? { table } : { error: "No table available for that league/season." };
  },
};

const searchPlayer: Tool = {
  definition: {
    type: "function",
    function: {
      name: "search_player",
      description: "Look up a player or athlete in any sport: current team, position, nationality, date of birth and bio.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "Player name, e.g. 'Mohamed Salah'" } },
        required: ["name"],
      },
    },
  },
  async run(args) {
    const data = await sportsDb("searchplayers.php", { p: str(args, "name") });
    const players = pick(data.player, [
      "strPlayer", "strTeam", "strSport", "strNationality", "strPosition",
      "dateBorn", "strHeight", "strDescriptionEN",
    ], 5);
    return players.length ? { players } : { error: "No player found with that name." };
  },
};

const customApi: Tool = {
  definition: {
    type: "function",
    function: {
      name: "custom_sports_api",
      description: "Query the project's own sports data API for scores, fixtures or stats.",
      parameters: {
        type: "object",
        properties: {
          sport: { type: "string", description: "e.g. football, basketball, tennis" },
          query: { type: "string", description: "Team, player or league" },
        },
        required: ["sport", "query"],
      },
    },
  },
  async run(args) {
    // Mirror your curl here: same URL, query params and headers.
    const url = new URL(process.env.SPORTS_API_URL as string);
    url.searchParams.set("sport", str(args, "sport"));
    url.searchParams.set("q", str(args, "query"));
    const res = await fetch(url, { headers: { "x-api-key": process.env.SPORTS_API_KEY ?? "" } });
    if (!res.ok) return { error: `Sports API returned ${res.status}` };
    return res.json();
  },
};

export const tools: Tool[] = [
  searchTeam,
  teamEvents,
  leagueTable,
  searchPlayer,
  ...(process.env.SPORTS_API_URL ? [customApi] : []),
];
