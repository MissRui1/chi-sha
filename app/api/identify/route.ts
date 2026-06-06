import { z } from "zod";
import { createAiClient, getAiModel } from "@/lib/ai";

const IdentifyRequestSchema = z
  .object({
    imageDataUrl: z.string().optional(),
    base64: z.string().optional(),
  })
  .refine(
    (value) => Boolean(value.imageDataUrl ?? value.base64),
    "imageDataUrl or base64 is required"
  );

const IdentifySchema = z.object({
  dish: z.string().min(1),
  suggestion: z.string().min(1),
});

type IdentifyResult = z.infer<typeof IdentifySchema>;

const fallbackResult: IdentifyResult = {
  dish: "未识别菜品",
  suggestion:
    "图片信息有点不够明确，可以换一张更清晰、光线更好的照片再试一次。",
};

const cleanJson = (value: string) =>
  value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

const toDataUrl = (body: z.infer<typeof IdentifyRequestSchema>) => {
  const input = (body.imageDataUrl ?? body.base64 ?? "").trim();

  if (input.startsWith("data:image/")) {
    return input;
  }

  const normalized = input.replace(/\s/g, "");
  return `data:image/jpeg;base64,${normalized}`;
};

const parseIdentifyResult = (text: string): IdentifyResult => {
  try {
    const parsed = JSON.parse(cleanJson(text));
    const candidate = Array.isArray(parsed)
      ? parsed[0]
      : parsed;

    return IdentifySchema.parse(candidate);
  } catch (error) {
    console.log("Invalid identify AI response:", error);
    return fallbackResult;
  }
};

export async function POST(req: Request) {
  try {
    const body = IdentifyRequestSchema.parse(await req.json());
    const imageUrl = toDataUrl(body);
    const client = createAiClient();

    const completion =
      await client.chat.completions.create({
        model: getAiModel(),
        messages: [
          {
            role: "system",
            content:
              "你是一个识别食物图片的助手。只返回 JSON，不要添加 markdown。",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  '识别图片里最可能的菜品或食物，并给一句适合现在怎么吃/搭配/注意事项的建议。严格返回 JSON：{"dish":"","suggestion":""}',
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              },
            ],
          },
        ],
        temperature: 0.4,
      });

    const text =
      completion.choices[0]?.message?.content ?? "";

    return Response.json(parseIdentifyResult(text));
  } catch (error) {
    console.log(error);
    return Response.json(fallbackResult);
  }
}
