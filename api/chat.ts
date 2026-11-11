import type { VercelRequest, VercelResponse } from "@vercel/node";
import { complete } from "./_lib/llm";
import { tools } from "./_lib/sports";
import type { Message } from "./_lib/types";

const MAX_TOOL_ROUNDS = 5;
const MAX_HISTORY = 20;
const MAX_CHARS = 4000;

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `You are the assistant for a sports management project. Today is ${today}.`,
    "Answer questions about any sport: rules, tactics, training, history, records, players, teams, leagues and results.",
    "For anything time-sensitive (scores, fixtures, standings, current squads or transfers) call the tools first.",
    "Never invent scores, dates or statistics. If the tools return nothing, say the live data is unavailable and, if useful, give what you know with the year it is from.",
    "Keep answers short and direct. Use a small table or list only when it helps.",
  ].join("\n");
}

function cleanHistory(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
}

async function runTool(name: string, rawArgs: string): Promise<unknown> {
  const tool = tools.find((t) => t.definition.function.name === name);
  if (!tool) return { error: `Unknown tool ${name}` };
  try {
    return await tool.run(JSON.parse(rawArgs || "{}"));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function chat(userMessage: string, history: Message[]): Promise<string> {
  const messages: Message[] = [
    { role: "system", content: systemPrompt() },
    ...history,
    { role: "user", content: userMessage },
  ];
  const definitions = tools.map((t) => t.definition);

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const msg = await complete(messages, definitions);
    messages.push(msg);
    if (!msg.tool_calls?.length) return msg.content ?? "";

    for (const call of msg.tool_calls) {
      const result = await runTool(call.function.name, call.function.arguments);
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return "I couldn't finish looking that up. Try asking a narrower question.";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const body = (req.body ?? {}) as { message?: unknown; history?: unknown };
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) return res.status(400).json({ error: "Missing message" });

  try {
    const reply = await chat(message.slice(0, MAX_CHARS), cleanHistory(body.history));
    return res.status(200).json({ reply });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
