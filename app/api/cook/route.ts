import { z } from "zod";
import { createAiClient, getAiModel } from "@/lib/ai";
import { runJsonPrompt } from "@/lib/prompt-harness";

const CookRequestSchema = z.object({
  mealTime: z.string().optional(),
  mood: z.string().optional(),
  menu: z.array(z.string()).min(1),
  history: z.array(z.string()).optional(),
  currentTime: z.string().optional(),
  timezone: z.string().optional(),
});

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

const fallbackCook = (menu: string[]): CookResult => {
  const dish = menu[0] ?? "番茄炒蛋";

  return {
    dish,
    reason:
      "从你的菜单里选一个最稳的，今天先把饭做得简单、热乎、能入口。",
    ingredients: ["主食材", "葱姜蒜", "盐", "生抽"],
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
  try {
    const body = CookRequestSchema.parse(await req.json());
    const menu = body.menu
      .map((item) => item.trim())
      .filter(Boolean);
    const history = body.history ?? [];
    const fallback = fallbackCook(menu);
    const menuText = menu
      .map((item, index) => `${index + 1}. ${item}`)
      .join("\n");

    const systemPrompt = `
你是“做啥”的家常菜决策和简明菜谱引擎。

硬性规则：
1. dish 必须逐字来自用户菜单，不能创造菜单外的菜名。
2. 如果历史里出现过某菜，除非菜单只剩这一道，否则优先避开。
3. 根据真实时间、餐次和用户状态选择最合适、最不折腾的一道菜。
4. reason 只写 1 句，36-80 个中文字符，直接说明为什么现在适合做它。
5. ingredients 写 3-8 项常见食材/调料，不要写克数，不要写稀有材料。
6. steps 写 3-6 步，每步一句短话，能让普通人照着做。
7. tips 写 1 句实用提醒。
8. 只返回 JSON，不要 markdown，不要额外字段。`;

    const userPrompt = `
真实当前时间：${formatTime(body.currentTime, body.timezone)}
用户选择餐次：${body.mealTime ?? "晚餐"}
用户状态：${body.mood ?? "普通"}

用户菜单：
${menuText}

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
      result: JSON.stringify(fallbackCook(["番茄炒蛋"])),
    });
  }
}
