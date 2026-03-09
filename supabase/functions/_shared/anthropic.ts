// Shared Anthropic Claude API helper for all edge functions

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicToolProperty {
  type: string;
  description?: string;
  enum?: string[];
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, AnthropicToolProperty>;
    required: string[];
  };
}

export interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  tool_choice?: { type: "tool"; name: string };
}

export async function callAnthropic(request: AnthropicRequest): Promise<Record<string, unknown>> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Anthropic API error:", response.status, errText);
    throw new Error(`Anthropic API failed: ${response.status} - ${errText}`);
  }

  const data = await response.json();

  // Extract tool use result from response
  const toolUseBlock = data.content?.find(
    (block: { type: string }) => block.type === "tool_use"
  );

  if (toolUseBlock) {
    return toolUseBlock.input;
  }

  // Fallback: return text content
  const textBlock = data.content?.find(
    (block: { type: string }) => block.type === "text"
  );

  return { text: textBlock?.text || "" };
}
