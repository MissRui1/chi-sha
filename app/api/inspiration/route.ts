import { createAiClient, getAiModel } from "@/lib/ai";
import { z } from "zod";

const CACHE_TTL = 10 * 60 * 1000;

type CacheEntry = {
  expiresAt: number;
  result: string;
};

const inspirationCache = new Map<string, CacheEntry>();

const InspirationSchema = z
  .array(
    z.object({
      title: z.string().min(1),
      desc: z.string().min(1),
    })
  )
  .min(1);

const cleanJson = (value: string) =>
  value
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

const fallbackInspirations = [
  {
    title: "适合下班后的热乎晚餐",
    desc: "今天别太累着自己。",
  },
  {
    title: "适合没食欲时的一点清爽",
    desc: "先吃一点容易入口的，状态会慢慢回来。",
  },
  {
    title: "适合奖励自己的晚餐",
    desc: "辛苦了一天，可以吃点真正让你满足的。",
  },
  {
    title: "适合深夜的轻负担选择",
    desc: "别太刺激，热乎一点就很好。",
  },
  {
    title: "适合减脂期的稳定一餐",
    desc: "吃饱，但不给身体太多负担。",
  },
  {
    title: "适合交给命运的一顿",
    desc: "别想太久，今天让随机来救你。",
  },
];

const parseInspirations = (text: string) => {
  try {
    const parsed = JSON.parse(cleanJson(text));
    const result = InspirationSchema.parse(parsed);
    const normalized =
      result.length >= 6
        ? result.slice(0, 6)
        : [
            ...result,
            ...fallbackInspirations.slice(
              0,
              6 - result.length
            ),
          ];

    return JSON.stringify(normalized);
  } catch (error) {
    console.log("Invalid inspiration response:", error);
    return JSON.stringify(fallbackInspirations);
  }
};

export async function POST(req: Request) {
  try {
    const {
      mood,
      mealTime,
      memory,
    } = await req.json();
    const memoryList = Array.isArray(memory)
      ? memory
      : [];
    const cacheKey = JSON.stringify({
      mood,
      mealTime,
    });
    const cached = inspirationCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now()) {
      return Response.json({
        result: cached.result,
        cached: true,
      });
    }

    const prompt = `
你是一个很会生活的人。

你现在的任务：
不是推荐具体吃什么。

而是：
生成“今天适合的饮食灵感”。

这些灵感应该：

- 有生活感
- 很真实
- 像今天真的会发生
- 不要太文艺
- 不要太AI
- 不要鸡汤

灵感方向可以包括：

- 情绪场景
- 工作日状态
- 夏天/深夜/下雨天
- 独处晚餐
- 加班后的食物
- 没食欲时
- 想奖励自己时
- 减脂期
- 周五晚上的满足感

每条灵感：
必须包含：

- title
- desc

风格参考：

title:
“适合加班后的热乎晚餐”

desc:
“今天别太折腾自己。”

必须返回 JSON 数组：

[
  {
    "title": "",
    "desc": ""
  }
]

生成 6 条。

用户状态：

当前时间：
${mealTime}

当前情绪：
${mood}

最近记录：
${memoryList.join("、")}
`;
    const client = createAiClient();

    const completion =
      await client.chat.completions.create({
        model: getAiModel(),

        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],

        temperature: 1.3,
      });

    const result =
      completion.choices[0].message.content;
    const normalizedResult = parseInspirations(
      result ?? ""
    );

    inspirationCache.set(cacheKey, {
      result: normalizedResult,
      expiresAt: Date.now() + CACHE_TTL,
    });

    console.log(
      "INSPIRATION AI:",
      normalizedResult
    );

    return Response.json({
      result: normalizedResult,
      cached: false,
    });
  } catch (error) {
    console.log(error);

    return Response.json({
      result: JSON.stringify(fallbackInspirations),
      cached: false,
    });
  }
}
