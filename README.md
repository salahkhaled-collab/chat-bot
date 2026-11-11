# Sports Bot

A chat assistant for a sports management project. TypeScript end to end:
a Vite frontend (`src/`) and a Vercel serverless function (`api/chat.ts`)
that talks to an LLM and calls live sports-data tools.

## How it works

```
browser (src/main.ts) ──POST /api/chat──> api/chat.ts
                                            ├─ api/_lib/llm.ts     Groq or xAI Grok (OpenAI-compatible)
                                            └─ api/_lib/sports.ts  tools: search_team, team_events,
                                                                   league_table, search_player
```

The model answers general questions (rules, history, training) from its own
knowledge and calls the tools for anything time-sensitive (scores, fixtures,
standings). Live data comes from [TheSportsDB](https://www.thesportsdb.com).

## Environment variables

| Name | Required | Notes |
|---|---|---|
| `GROQ_API_KEY` | one of these two | Groq (free tier, Llama models) |
| `XAI_API_KEY` | one of these two | xAI Grok. Used automatically when set |
| `LLM_PROVIDER` | no | `groq` or `xai` to force one |
| `LLM_MODEL` | no | Override the default model name |
| `SPORTSDB_KEY` | no | Defaults to the free test key `3` (limited) |
| `SPORTS_API_URL`, `SPORTS_API_KEY` | no | Adds your own API as an extra tool |

Put them in `.env.local` for local dev, and in the Vercel dashboard for deploys.

## Run locally

```bash
npm install
```

```bash
npx vercel dev
```

`npm run dev:ui` runs only the frontend (the chat will fail without the API).

## Checks

```bash
npm run typecheck
```

```bash
npm run build
```

## Adding a data source

Add a `Tool` object to `api/_lib/sports.ts` (a JSON-schema definition plus a
`run` function) and include it in the exported `tools` array. The model sees
it on the next request.
