import { z } from "zod";
import { createAiClient, getAiModel } from "@/lib/ai";
import { runJsonPrompt } from "@/lib/prompt-harness";

const IdentifyRequestSchema = z
  .object({
    imageDataUrl: z.string().max(2_800_000).optional(),
    base64: z.string().max(2_800_000).optional(),
  })
  .refine(
    (value) => Boolean(value.imageDataUrl ?? value.base64),
    "imageDataUrl or base64 is required"
  );

const IdentifySchema = z.object({
  kind: z.enum(["dish", "ingredient", "non_food"]),
  isDish: z.boolean(),
  dish: z.string().min(1),
  suggestion: z.string().min(1),
  ingredients: z.array(z.string().trim().min(1)).max(8),
  cookableDishes: z
    .array(
      z.object({
        dish: z.string().min(1),
        reason: z.string().min(4),
        ingredients: z.array(z.string().min(1)).min(2).max(8),
        steps: z.array(z.string().min(4)).min(2).max(5),
        tips: z.string().min(1),
      })
    )
    .max(3),
}).superRefine((value, ctx) => {
  if (
    value.kind !== "non_food" &&
    value.ingredients.length === 0
  ) {
    ctx.addIssue({
      code: "custom",
      message: "food image must include ingredients",
      path: ["ingredients"],
    });
  }

  if (value.kind === "non_food" && value.isDish) {
    ctx.addIssue({
      code: "custom",
      message: "non_food cannot be dish",
      path: ["isDish"],
    });
  }
});

type IdentifyResult = z.infer<typeof IdentifySchema>;

const fallbackResult: IdentifyResult = {
  kind: "non_food",
  isDish: false,
  dish: "未识别菜品",
  suggestion:
    "图片信息有点不够明确，可以换一张更清晰、光线更好的照片再试一次。",
  ingredients: [],
  cookableDishes: [],
};

const toDataUrl = (body: z.infer<typeof IdentifyRequestSchema>) => {
  const input = (body.imageDataUrl ?? body.base64 ?? "").trim();

  if (input.startsWith("data:image/")) {
    if (
      !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(input)
    ) {
      throw new Error("Unsupported image type");
    }

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
            "你是食材识别与清库存做菜引擎。重点识别图片里的可食用食材；成品菜也要尽量拆出主要食材。不要把锅、餐具、包装、家具等物品当作食物。只返回 JSON。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                '判断图片里是否有可食用食材。kind 只能是 "ingredient"、"dish"、"non_food"。未烹饪或明显可拆分食材优先用 kind="ingredient"，isDish=false，dish 写“识别到食材”。成品菜/餐食/饮品如果能判断，kind="dish"，isDish=true，但 ingredients 必须列出可见或合理的主要食材。非食物用 kind="non_food"，isDish=false，dish 写“未识别食材”。ingredients 列出 1-8 个可见食材；cookableDishes 给出最多 3 个适合清理冰箱/处理剩余食材的中国家常菜简案，非食物为空。严格返回 JSON：{"kind":"ingredient","isDish":false,"dish":"识别到食材","suggestion":"识别到番茄和鸡蛋，可以优先做一道清库存家常菜。","ingredients":["番茄","鸡蛋"],"cookableDishes":[{"dish":"番茄炒蛋","reason":"番茄和鸡蛋都能直接用上，做法简单稳定。","ingredients":["番茄","鸡蛋","盐","葱"],"steps":["番茄切块，鸡蛋打散。","先炒鸡蛋盛出，再炒番茄出汁。","倒回鸡蛋，加盐炒匀出锅。"],"tips":"番茄先炒出汁会更入味。"}]}',
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
      throwOnFailure: true,
    });

    return Response.json(result);
  } catch (error) {
    console.log(error);
    return Response.json(
      {
        ...fallbackResult,
        ok: false,
      },
      { status: 503 }
    );
  }
}
