import type { AssistantMessage, Message, ToolDefinition } from "./types";

interface Provider {
  name: string;
  url: string;
  keyEnv: string;
  defaultModel: string;
}

const PROVIDERS: Record<string, Provider> = {
  groq: {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    defaultModel: "llama-3.3-70b-versatile",
  },
  xai: {
    name: "xAI Grok",
    url: "https://api.x.ai/v1/chat/completions",
    keyEnv: "XAI_API_KEY",
    defaultModel: "grok-3-mini",
  },
};

export function getProvider(): Provider & { apiKey: string | undefined; model: string } {
  const chosen =
    process.env.LLM_PROVIDER?.toLowerCase() ?? (process.env.XAI_API_KEY ? "xai" : "groq");
  const provider = PROVIDERS[chosen] ?? PROVIDERS.groq;
  return {
    ...provider,
    apiKey: process.env[provider.keyEnv],
    model: process.env.LLM_MODEL || provider.defaultModel,
  };
}

interface CompleteOptions {
  tools?: ToolDefinition[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export async function complete(
  messages: Message[],
  { tools = [], maxTokens, signal }: CompleteOptions = {}
): Promise<AssistantMessage> {
  const provider = getProvider();
  if (!provider.apiKey) {
    throw new Error(`${provider.keyEnv} is not set on the server.`);
  }

  const res = await fetch(provider.url, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      ...(tools.length ? { tools, tool_choice: "auto" } : {}),
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    throw new Error(`${provider.name} returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { choices: { message: AssistantMessage }[] };
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error(`${provider.name} returned no message.`);
  return message;
}
