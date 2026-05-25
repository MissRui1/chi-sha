import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL:
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

export async function POST(req: Request) {
  try {
    const {
      mealTime,
      mood,
      menu,
      history,
    } = await req.json();

    const prompt = `
你是一个很会生活的人。

你现在的任务：
不是推荐外卖。

而是：
帮用户决定“今晚做什么”。

你必须：

根据：
- 当前时间
- 当前情绪
- 用户会做的菜
- 最近做过的菜

做一个：

最适合今天状态的决定。

重点：

你推荐的菜：
必须来自用户自己的菜单。

不要推荐菜单外的菜。

你的目标是：

- 减少用户决策疲惫
- 不让用户做饭太累
- 真正符合现实生活

你需要隐式考虑：

- 做饭复杂度
- 情绪状态
- 今天适不适合折腾
- 热乎感
- 满足感
- 工作日/晚上的状态

例如：

如果用户：
emo

优先：
- 热乎
- 安慰感
- 简单

如果用户：
减脂期

优先：
- 清淡
- 低负担

如果用户：
奖励自己

可以稍微丰盛。

如果用户：
想吃凉快的

不要推荐：
- 火锅
- 麻辣烫
- 酸辣粉

如果用户：
没食欲

优先：
- 清爽
- 简单
- 容易入口

不要：
- 长篇大论
- AI味
- 过度文艺
- 过度懂用户

风格：

“今晚做番茄炒蛋吧。
简单一点，
今天别太累了。”

必须：
只返回 JSON：

{
  "dish": "",
  "reason": ""
}

用户信息：

时间：
${mealTime}

状态：
${mood}

用户菜单：
${menu.join("、")}

最近做过：
${history.join("、")}
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

        temperature: 1.1,
      });

    const result =
      completion.choices[0].message.content;

    console.log(
      "COOK AI:",
      result
    );

    return Response.json({
      result,
    });
  } catch (error) {
    console.log(error);

    return Response.json({
      result:
        '{"dish":"番茄炒蛋","reason":"简单一点，今天别太累了。"}',
    });
  }
}