import { complete } from "./llm";
import { tools } from "./sports";
import type { Message } from "./types";

interface AskOptions {
  system: string;
  question: string;
  history?: Message[];
  useTools?: boolean;
  maxTokens?: number;
  timeoutMs: number;
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

export async function ask({
  system,
  question,
  history = [],
  useTools = false,
  maxTokens = 400,
  timeoutMs,
}: AskOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const messages: Message[] = [
    { role: "system", content: system },
    ...history,
    { role: "user", content: question },
  ];
  const definitions = useTools ? tools.map((t) => t.definition) : [];

  try {
    for (let round = 0; round < 3; round++) {
      const msg = await complete(messages, {
        tools: definitions,
        maxTokens,
        signal: controller.signal,
      });
      messages.push(msg);
      if (!msg.tool_calls?.length) return (msg.content ?? "").trim();

      for (const call of msg.tool_calls) {
        const result = await runTool(call.function.name, call.function.arguments);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }
    return "";
  } finally {
    clearTimeout(timer);
  }
}
