import { z } from "zod";
import { createAiClient, getAiModel } from "@/lib/ai";
import { runJsonPrompt } from "@/lib/prompt-harness";

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
  isDish: z.boolean(),
  dish: z.string().min(1),
  suggestion: z.string().min(1),
});

type IdentifyResult = z.infer<typeof IdentifySchema>;

const fallbackResult: IdentifyResult = {
  isDish: false,
  dish: "未识别菜品",
  suggestion:
    "图片信息有点不够明确，可以换一张更清晰、光线更好的照片再试一次。",
};

const toDataUrl = (body: z.infer<typeof IdentifyRequestSchema>) => {
  const input = (body.imageDataUrl ?? body.base64 ?? "").trim();

  if (input.startsWith("data:image/")) {
    return input;
  }

  const normalized = input.replace(/\s/g, "");
  return `data:image/jpeg;base64,${normalized}`;
};

export async function POST(req: Request) {
  try {
    const body = IdentifyRequestSchema.parse(await req.json());
    const imageUrl = toDataUrl(body);
    const client = createAiClient();

    const result = await runJsonPrompt({
      client,
      model: getAiModel(),
      messages: [
        {
          role: "system",
          content:
            "你是菜品识别引擎，只识别可食用的菜品/餐食/饮品。不要把锅、餐具、包装、动物、植物、家具等物品当作菜。只返回 JSON。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                '判断图片主体是否为菜品、餐食或饮品。如果是，给出最可能的具体菜名；如果不是，isDish 为 false，dish 写“未识别菜品”。suggestion 写一句简短说明。严格返回 JSON：{"isDish":true,"dish":"","suggestion":""}',
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
      schema: IdentifySchema,
      fallback: fallbackResult,
      temperature: 0.15,
      maxAttempts: 2,
    });

    return Response.json(result);
  } catch (error) {
    console.log(error);
    return Response.json(fallbackResult);
  }
}
