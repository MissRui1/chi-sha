import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL:
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

export async function POST(req: Request) {
  try {
    const {
      mood,
      mealTime,
      memory,
    } = await req.json();

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

生成 4 条。

用户状态：

当前时间：
${mealTime}

当前情绪：
${mood}

最近记录：
${memory.join("、")}
`;

    const completion =
      await client.chat.completions.create({
        model: "qwen-plus",

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

    console.log(
      "INSPIRATION AI:",
      result
    );

    return Response.json({
      result,
    });
  } catch (error) {
    console.log(error);

    return Response.json({
      result: JSON.stringify([
        {
          title:
            "适合下班后的热乎晚餐",
          desc:
            "今天别太累着自己。",
        },
      ]),
    });
  }
}