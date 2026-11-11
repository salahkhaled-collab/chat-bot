// Vercel serverless function: POST /api/chat
// Env vars (set in Vercel dashboard): GROQ_API_KEY, optionally SPORTS_API_URL, SPORTS_API_KEY
import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile"; // supports tool use

// ---- Types ---------------------------------------------------------------
interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface SportsArgs {
  sport: string;
  query: string;
}

interface ChatRequest {
  message: string;
  history?: Message[];
}

// ---- Tool: PUT YOUR CURL HERE --------------------------------------------
// Translate the curl you have into this fetch call: same URL, same headers,
// same query params. Whatever it returns goes back to the model as JSON.
async function getSportsData({ sport, query }: SportsArgs): Promise<unknown> {
  const url = new URL(
    process.env.SPORTS_API_URL ?? "https://example.com/replace-with-your-curl-url"
  );
  url.searchParams.set("sport", sport);
  url.searchParams.set("q", query);

  const res = await fetch(url, {
    headers: {
      // Copy the headers from your curl, e.g. an API key:
      "x-api-key": process.env.SPORTS_API_KEY ?? "",
    },
  });
  if (!res.ok) return { error: `Sports API returned ${res.status}` };
  return res.json();
}

const tools = [
  {
    type: "function",
    function: {
      name: "get_sports_data",
      description:
        "Look up live or recent sports data: scores, standings, fixtures, player stats. Use for any question about a current or recent sports result.",
      parameters: {
        type: "object",
        properties: {
          sport: { type: "string", description: "e.g. football, basketball, tennis" },
          query: { type: "string", description: "Team, player or league the user asked about" },
        },
        required: ["sport", "query"],
      },
    },
  },
] as const;

const toolImpls: Record<string, (args: SportsArgs) => Promise<unknown>> = {
  get_sports_data: getSportsData,
};

// ---- Groq + tool-use loop -------------------------------------------------
async function groq(messages: Message[]) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, messages, tools, tool_choice: "auto" }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    choices: { message: Extract<Message, { role: "assistant" }> }[];
  };
  return data.choices[0].message;
}

async function chat(userMessage: string, history: Message[] = []): Promise<string> {
  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are a sports assistant. Use get_sports_data for any factual sports question. If the tool returns an error or nothing, say so; never invent scores.",
    },
    ...history,
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < 5; i++) {
    const msg = await groq(messages);
    messages.push(msg);

    if (!msg.tool_calls?.length) return msg.content ?? "";

    for (const call of msg.tool_calls) {
      let result: unknown;
      try {
        const args = JSON.parse(call.function.arguments) as SportsArgs;
        const impl = toolImpls[call.function.name];
        result = impl ? await impl(args) : { error: `Unknown tool ${call.function.name}` };
      } catch (e) {
        result = { error: String(e) };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return "Sorry, I couldn't complete that request.";
}

// ---- Handler --------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured on the server yet." });
  }
  try {
    const { message, history } = req.body as ChatRequest;
    if (!message) return res.status(400).json({ error: "Missing message" });
    const reply = await chat(message, history);
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
