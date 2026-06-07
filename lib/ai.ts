import OpenAI from "openai";

const DEFAULT_AI_BASE_URL =
  "https://api.openai-next.com/v1";
const DEFAULT_AI_MODEL =
  "gemini-3.1-flash-image-preview";
const DEFAULT_RECOMMEND_MODEL = "qwen3-max";

const readEnv = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const getAiModel = () =>
  readEnv(process.env.AI_MODEL) ?? DEFAULT_AI_MODEL;

export const getRecommendModel = () =>
  readEnv(process.env.RECOMMEND_AI_MODEL) ??
  DEFAULT_RECOMMEND_MODEL;

export const createAiClient = () => {
  const apiKey =
    readEnv(process.env.AI_API_KEY) ??
    readEnv(process.env.DASHSCOPE_API_KEY);

  if (!apiKey) {
    throw new Error(
      "Missing AI_API_KEY. DASHSCOPE_API_KEY is supported as a legacy fallback."
    );
  }

  return new OpenAI({
    apiKey,
    baseURL:
      readEnv(process.env.AI_BASE_URL) ??
      DEFAULT_AI_BASE_URL,
  });
};
