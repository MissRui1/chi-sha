import type OpenAI from "openai";
import type { z } from "zod";

type ChatMessages = Parameters<
  OpenAI["chat"]["completions"]["create"]
>[0]["messages"];

type JsonPromptHarnessOptions<T> = {
  client: OpenAI;
  model: string;
  messages: ChatMessages;
  schema: z.ZodType<T>;
  fallback: T;
  temperature?: number;
  maxAttempts?: number;
  repairPrompt?: string;
  validate?: (value: T) => void;
};

export const cleanJson = (value: string) =>
  {
    const cleaned = value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

    const objectStart = cleaned.indexOf("{");
    const objectEnd = cleaned.lastIndexOf("}");
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");

    if (
      objectStart >= 0 &&
      objectEnd > objectStart &&
      (arrayStart === -1 || objectStart < arrayStart)
    ) {
      return cleaned.slice(objectStart, objectEnd + 1);
    }

    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return cleaned.slice(arrayStart, arrayEnd + 1);
    }

    return cleaned;
  };

export async function runJsonPrompt<T>({
  client,
  model,
  messages,
  schema,
  fallback,
  temperature = 0.7,
  maxAttempts = 2,
  repairPrompt =
    "上一次输出没有通过校验。只返回合法 JSON，不要 markdown，不要解释，不要添加多余字段。",
  validate,
}: JsonPromptHarnessOptions<T>): Promise<T> {
  let lastText = "";
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const attemptMessages =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "user" as const,
              content: `${repairPrompt}\n\n校验错误：${String(lastError)}`,
            },
          ];

    const completion =
      await client.chat.completions.create({
        model,
        messages: attemptMessages,
        temperature,
      });

    lastText =
      completion.choices[0]?.message?.content ?? "";

    try {
      const parsed = JSON.parse(cleanJson(lastText));
      const value = schema.parse(parsed);
      validate?.(value);

      return value;
    } catch (error) {
      lastError = error;
      console.log("JSON harness validation failed:", error);
    }
  }

  console.log("JSON harness fallback. Last output:", lastText);

  return fallback;
}
