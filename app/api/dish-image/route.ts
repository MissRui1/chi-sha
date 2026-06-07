import { z } from "zod";
import { createImageAiClient, getImageModel } from "@/lib/ai";

const DishImageRequestSchema = z.object({
  dish: z.string().trim().min(1).max(60),
});

const buildDishImagePrompt = (dish: string) =>
  [
    "Create one appetizing square food photograph for a Chinese meal-planning app.",
    `Dish name: ${dish}.`,
    "The image must depict this exact dish or the closest faithful interpretation of it, not a generic mixed food spread.",
    "Style: warm natural window light, overhead or 45-degree tabletop view, ceramic plate or bowl, clean home-cooking presentation, subtle cream paper background, cozy editorial food magazine mood.",
    "Composition: the dish is the clear central subject, generous crop margin, no hands, no people, no text, no logo, no watermark, no menu card UI.",
    "Avoid mismatched cuisines, random unrelated ingredients, dark lighting, excessive garnish, and cluttered table settings.",
  ].join("\n");

const imageToDataUrl = (image: {
  b64_json?: string;
  url?: string;
}) => {
  if (image.b64_json) {
    return `data:image/jpeg;base64,${image.b64_json}`;
  }

  return image.url;
};

export async function POST(req: Request) {
  try {
    const { dish } = DishImageRequestSchema.parse(await req.json());
    const client = createImageAiClient();
    const response = await client.images.generate({
      model: getImageModel(),
      prompt: buildDishImagePrompt(dish),
      n: 1,
      size: "1024x1024",
      quality: "low",
      output_format: "jpeg",
    });
    const image = response.data?.[0];
    const imageUrl = image ? imageToDataUrl(image) : undefined;

    if (!imageUrl) {
      throw new Error("Image model returned no image");
    }

    return Response.json({
      dish,
      imageUrl,
      revisedPrompt: image?.revised_prompt,
    });
  } catch (error) {
    console.log("Dish image generation failed:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "dish image generation failed",
      },
      { status: 503 }
    );
  }
}
