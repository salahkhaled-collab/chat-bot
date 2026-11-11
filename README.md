# Pulse Gym – Smart Gym Assistant

A gym website with a customer assistant built on **Dialogflow ES**. The assistant
answers questions about memberships, classes, hours and trainers, books classes,
and builds workout plans.

```
Website (Vite + TypeScript)
  └─ Dialogflow Messenger widget
        └─ Dialogflow ES agent  (intents, entities, slot filling)
              └─ Webhook: api/dialogflow.ts on Vercel
                    ├─ Book Class    → checks the class runs that day, returns a booking reference
                    ├─ Workout Plan  → plan from Groq, with a built-in template if Groq is slow
                    └─ Fallback      → Groq answers anything else, with live sports data from TheSportsDB
```

All gym details (name, prices, classes, hours) live in `data/gym.json`. The website,
the webhook and the Dialogflow agent all read from that one file.

## 1. Import the agent into Dialogflow

1. Go to https://dialogflow.cloud.google.com and create a new agent (Dialogflow **ES**), time zone Africa/Cairo.
2. Click the gear icon → **Export and Import** → **Restore from zip**.
3. Choose `dialogflow/PulseGym-agent.zip` and type `RESTORE`.

After changing `data/gym.json`, rebuild the zip with `npm run build:agent` and restore again.

## 2. Connect the webhook

1. In Dialogflow open **Fulfillment** and turn on **Webhook**.
2. URL: `https://<your-vercel-domain>/api/dialogflow`
3. Optional but recommended: add a header `x-webhook-secret` with a random value, and set the
   same value as `DIALOGFLOW_WEBHOOK_SECRET` in Vercel.
4. Save.

## 3. Put the chat on the website

1. In Dialogflow open **Integrations** → **Dialogflow Messenger** → **Enable**.
2. Copy the `agent-id` value from the snippet it shows.
3. In Vercel add `VITE_DIALOGFLOW_AGENT_ID` with that value, then redeploy.

## Vercel environment variables

| Name | Type | Notes |
|---|---|---|
| `GROQ_API_KEY` | Secret | Groq key, used by the webhook |
| `LLM_MODEL` | Config | Current Groq model with tool use |
| `VITE_DIALOGFLOW_AGENT_ID` | Config | From Dialogflow Messenger |
| `DIALOGFLOW_WEBHOOK_SECRET` | Secret | Optional, must match the Dialogflow header |
| `SPORTSDB_KEY` | Secret | Optional, defaults to the free key |

## Scripts

```bash
npm run build:agent
```

```bash
npm run typecheck
```

```bash
npm run build
```
