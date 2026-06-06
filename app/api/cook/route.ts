import { z } from "zod";
import { createAiClient, getAiModel } from "@/lib/ai";
import { runJsonPrompt } from "@/lib/prompt-harness";

const CookRequestSchema = z
  .object({
    userId: z.string().optional(),
    mealTime: z.string().optional(),
    mood: z.string().optional(),
    menu: z
      .array(z.string().trim().min(1))
      .optional()
      .default([]),
    history: z.array(z.string()).optional(),
    availableIngredients: z
      .array(z.string().trim().min(1))
      .max(12)
      .optional()
      .default([]),
    currentTime: z.string().optional(),
    timezone: z.string().optional(),
  })
  .refine(
    (value) =>
      value.menu.length > 0 ||
      value.availableIngredients.length > 0,
    "menu or availableIngredients is required"
  );

const CookSchema = z.object({
  dish: z.string().min(1),
  reason: z.string().min(8).max(90),
  ingredients: z.array(z.string().min(1)).min(3).max(8),
  steps: z.array(z.string().min(4)).min(3).max(6),
  tips: z.string().min(4).max(60),
});

type CookResult = z.infer<typeof CookSchema>;

const normalizeDish = (value: string) =>
  value.replace(/\s/g, "").toLowerCase();

const uniq = (items: string[]) =>
  items
    .map((item) => item.trim())
    .filter(
      (item, index, arr) =>
        item && arr.indexOf(item) === index
    );

const fallbackCook = (
  menu: string[],
  availableIngredients: string[]
): CookResult => {
  const dish =
    menu[0] ??
    `${
      availableIngredients.slice(0, 2).join("") ||
      "食材"
    }家常小炒`;
  const ingredients = uniq([
    ...availableIngredients.slice(0, 5),
    "葱姜蒜",
    "盐",
    "生抽",
  ]).slice(0, 8);

  return {
    dish,
    reason: menu[0]
      ? "从你的菜单里选一个最稳的，今天先把饭做得简单、热乎、能入口。"
      : "根据刚识别到的食材，先做一道简单热乎的家常菜，动线短也不浪费。",
    ingredients,
    steps: [
      "把食材洗净切好，调料先放在手边。",
      "热锅少油，先炒香葱姜蒜或主要香料。",
      "放入主食材翻炒到断生，再按口味调盐和生抽。",
      "收一下汁或炒匀后出锅，趁热吃。",
    ],
    tips: "按你平时口味微调咸淡即可。",
  };
};

const formatTime = (
  currentTime?: string,
  timezone = "Asia/Shanghai"
) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(currentTime ? new Date(currentTime) : new Date());

export async function POST(req: Request) {
  let fallback: CookResult | null = null;

  try {
    const body = CookRequestSchema.parse(await req.json());
    const menu = body.menu
      .map((item) => item.trim())
      .filter(Boolean);
    const history = body.history ?? [];
    const availableIngredients =
      body.availableIngredients ?? [];
    fallback = fallbackCook(menu, availableIngredients);
    const menuText = menu
      .map((item, index) => `${index + 1}. ${item}`)
      .join("\n") || "暂无";
    const hasMenu = menu.length > 0;

    const systemPrompt = `
你是“做啥”的家常菜决策和简明菜谱引擎。

硬性规则：
${hasMenu
  ? "1. dish 必须逐字来自用户菜单，不能创造菜单外的菜名。"
  : "1. 用户菜单为空时，dish 必须是用当前识别到的食材能现实做出的中国家常菜。"}
2. 如果历史里出现过某菜，除非可选项太少，否则优先避开。
3. 如果提供了“当前识别到的食材”，优先选择最能用上这些食材、且做起来现实的一道菜。
4. 根据真实时间、餐次和用户状态选择最合适、最不折腾的一道菜。
5. reason 只写 1 句，36-80 个中文字符，直接说明为什么现在适合做它。
6. ingredients 写 3-8 项常见食材/调料，尽量包含识别到的食材，不要写克数，不要写稀有材料。
7. steps 写 3-6 步，每步一句短话，能让普通人照着做。
8. tips 写 1 句实用提醒。
9. 只返回 JSON，不要 markdown，不要额外字段。`;

    const userPrompt = `
真实当前时间：${formatTime(body.currentTime, body.timezone)}
用户选择餐次：${body.mealTime ?? "晚餐"}
用户状态：${body.mood ?? "普通"}

用户菜单：
${menuText}

当前识别到的食材：
${availableIngredients.join("、") || "暂无"}

最近做过：
${history.join("、") || "暂无"}

严格返回：
{
  "dish": "",
  "reason": "",
  "ingredients": [],
  "steps": [],
  "tips": ""
}`;

    const client = createAiClient();
    const result = await runJsonPrompt({
      client,
      model: getAiModel(),
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      schema: CookSchema,
      fallback,
      temperature: 0.55,
      maxAttempts: 3,
      validate: (value) => {
        if (!hasMenu) {
          return;
        }

        const dish = normalizeDish(value.dish);
        const isFromMenu = menu.some(
          (item) => normalizeDish(item) === dish
        );

        if (!isFromMenu) {
          throw new Error(
            `Dish is not from user menu: ${value.dish}`
          );
        }
      },
    });

    return Response.json({
      result: JSON.stringify(result),
    });
  } catch (error) {
    console.log(error);

    return Response.json({
      result: JSON.stringify(
        fallback ?? {
          dish: "",
          reason:
            "菜单为空，暂时无法从你的菜单里决定要做什么。",
          ingredients: [],
          steps: [],
          tips: "先添加一道你会做的菜。",
        }
      ),
    });
  }
}
