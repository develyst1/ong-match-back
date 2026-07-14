const AI_BASE_URL = process.env.AI_BASE_URL ?? "https://ai.develyst.online";

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOpts {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** Call the AI API Center /chat endpoint and return the raw string content. */
export async function chat(messages: ChatMsg[], opts: ChatOpts = {}): Promise<string> {
  const res = await fetch(`${AI_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: opts.provider,
      model: opts.model,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 1024,
      messages,
    }),
  });
  const body = (await res.json()) as { success?: boolean; error?: string; data?: { content?: string } };
  if (!body?.success || !body?.data?.content) {
    throw new Error(body?.error ?? "AI call failed");
  }
  return body.data.content;
}
