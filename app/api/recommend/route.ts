import OpenAI from "openai";

type RecommendationRules = {
  bannedFoods: string[];
  preferredKeywords: string[];
  banReasons: string;
};

const generateRules = (
  mood: string,
  mealTime: string,
  style: string,
  previousFood?: string
): RecommendationRules => {
  const rules: RecommendationRules = {
    bannedFoods: [],
    preferredKeywords: [],
    banReasons: "",
  };

  const banParts: string[] = [];
  const prefixParts: string[] = [];

  // "想吃凉快的" 规则
  if (mood === "想吃凉快的") {
    rules.bannedFoods.push(
      "火锅",
      "麻辣烫",
      "酸辣粉",
      "热汤",
      "汤面",
      "重辣",
      "烧烤",
      "重油"
    );
    rules.preferredKeywords.push(
      "冷面",
      "寿司",
      "沙拉",
      "凉皮",
      "poke bowl",
      "越南春卷",
      "冰粉",
      "凉拌"
    );
    banParts.push(
      "禁止推荐：火锅、麻辣烫、酸辣粉、热汤、汤面、重辣、烧烤、重油"
    );
    prefixParts.push(
      "优先推荐：冷面、寿司、沙拉、凉皮、poke bowl、越南春卷、冰粉、凉拌类"
    );
  }

  // "没食欲" 规则
  if (mood === "没食欲") {
    rules.bannedFoods.push(
      "重辣",
      "巨油",
      "超大份",
      "高刺激",
      "重口味"
    );
    rules.preferredKeywords.push(
      "粥",
      "蒸蛋",
      "清汤",
      "小份面",
      "日式简餐",
      "清粥",
      "清汤面",
      "清淡"
    );
    banParts.push(
      "禁止推荐：重辣、巨油、超大份、高刺激、重口味"
    );
    prefixParts.push(
      "优先推荐：粥、蒸蛋、清汤、小份面、日式简餐、清淡类"
    );
  }

  // "奖励自己" + "晚餐" 规则
  if (mood === "奖励自己" && mealTime === "晚餐") {
    rules.preferredKeywords.push(
      "烤肉",
      "韩餐",
      "火锅",
      "寿司",
      "满足感",
      "大份",
      "高端",
      "值得纪念"
    );
    prefixParts.push(
      "强烈推荐提升满足感的食物：烤肉、韩餐、火锅、寿司等"
    );
  }

  // "减脂期" 规则
  if (mood === "减脂期") {
    rules.bannedFoods.push(
      "炸鸡",
      "奶茶",
      "高糖",
      "高油",
      "肥肉",
      "甜品",
      "油炸"
    );
    rules.preferredKeywords.push(
      "沙拉",
      "鸡胸肉",
      "三明治",
      "健康碗",
      "低脂",
      "清蒸",
      "烤制",
      "清淡"
    );
    banParts.push(
      "禁止推荐：炸鸡、奶茶、高糖、高油、肥肉、甜品、油炸类"
    );
    prefixParts.push(
      "优先推荐：沙拉、鸡胸肉、三明治、健康碗、低脂类"
    );
  }

  // retry=true 时，禁止重复
  if (previousFood) {
    rules.bannedFoods.push(previousFood);
    banParts.push(`绝对禁止推荐：${previousFood}`);
  }

  rules.banReasons = banParts.join("\n");
  const prefixReasons = prefixParts.join("\n");

  return {
    ...rules,
    banReasons:
      banParts.length > 0
        ? `推荐规则：\n${banParts.join("\n")}\n${prefixParts.join("\n")}`
        : prefixParts.length > 0
          ? `推荐规则：\n${prefixParts.join("\n")}`
          : "",
  };
};

type TimeContext = {
  hour: number;
  dayOfWeek: number;
  month: number;
  timeOfDay: "早餐" | "下午" | "深夜" | "正餐";
  dayName: string;
};

const getTimeInfo = (): TimeContext => {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const month = now.getMonth() + 1;

  const dayNames = [
    "周日",
    "周一",
    "周二",
    "周三",
    "周四",
    "周五",
    "周六",
  ];

  let timeOfDay: "早餐" | "下午" | "深夜" | "正餐" =
    "正餐";

  if (hour >= 6 && hour < 11) {
    timeOfDay = "早餐";
  } else if (hour >= 11 && hour < 17) {
    timeOfDay = "下午";
  } else if (hour >= 22 || hour < 6) {
    timeOfDay = "深夜";
  }

  return {
    hour,
    dayOfWeek,
    month,
    timeOfDay,
    dayName: dayNames[dayOfWeek],
  };
};

const getWeatherContext = (month: number): string => {
  if (month >= 6 && month <= 9) {
    return "夏季：推荐冷面、清爽、冷食、水果类，避免厚重热辣";
  } else if (month === 11 || month === 12 || month <= 2) {
    return "冬季：推荐汤类、火锅、热面、热食";
  } else if ((month >= 3 && month <= 5) || month === 10) {
    return "春秋季：温和舒适，兼容各类食物";
  }
  return "";
};

const generateContext = (timeInfo: TimeContext, mealTime: string): string => {
  const contextParts: string[] = [];

  contextParts.push(`【场景信息】`);
  contextParts.push(`${timeInfo.dayName} ${timeInfo.hour}点`);

  // 优先使用用户选择的 mealTime，如果未指定则使用系统时间
  let timeContext = timeInfo.timeOfDay;
  let mealTimeDesc = "";

  if (mealTime === "早餐") {
    mealTimeDesc = "现在是早餐时间：优先推荐快速、热乎、容易获得的选项";
  } else if (mealTime === "午餐") {
    mealTimeDesc = "现在是午餐时间：推荐营养均衡、满足感适中的选项";
  } else if (mealTime === "下午茶") {
    mealTimeDesc = "现在是下午茶时间：推荐轻食、小满足、下午茶感的食物";
  } else if (mealTime === "晚餐") {
    mealTimeDesc = "现在是晚餐时间：推荐满足感强、容易获得的选项";
  } else if (mealTime === "夜宵") {
    mealTimeDesc = "现在是夜宵时间：提高夜宵、满足感、热食的偏好，避免太清淡的选项";
  } else {
    // 如果 mealTime 不匹配预设值，则使用系统时间判断
    if (timeInfo.timeOfDay === "早餐") {
      mealTimeDesc = "现在是早餐时间：优先推荐快速、热乎、容易获得的选项";
    } else if (timeInfo.timeOfDay === "下午") {
      mealTimeDesc = "现在是下午：推荐轻食、小满足、下午茶感的食物";
    } else if (timeInfo.timeOfDay === "深夜") {
      mealTimeDesc = "现在是深夜：提高夜宵、满足感、热食的偏好，避免太清淡的选项";
    }
  }

  if (mealTimeDesc) {
    contextParts.push(mealTimeDesc);
  }

  // 星期规则
  if (timeInfo.dayOfWeek === 5) {
    contextParts.push(
      `现在是周五：用户倾向奖励自己，推荐烤肉、火锅等大满足食物`
    );
  } else if (timeInfo.dayOfWeek === 1) {
    contextParts.push(
      `现在是周一：推荐简单、热乎、不费脑的选项，避免太复杂或太罪恶的食物`
    );
  }

  // 天气/季节感知
  const weatherContext = getWeatherContext(timeInfo.month);
  if (weatherContext) {
    contextParts.push(`【季节背景】${weatherContext}`);
  }

  return contextParts.join("\n");
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      mealTime,
      mood,
      style,
      retry,
      previousFood,
      history,
      memory,
    } = body;

    const memoryList = Array.isArray(memory)
      ? memory
      : [];

    const memoryDescriptions = memoryList.map(
      (item: any) => {
        if (typeof item === "string") {
          return item;
        }

        return `${item.type === "dislike" ? "最近拒绝" : "最近喜欢"}：${item.mealTime} / ${item.mood} / ${item.style} / ${item.food}`;
      }
    );

    const memoryContext =
      memoryDescriptions.join("、") || "暂无";

    const likeContext = memoryDescriptions
      .filter((item: string) =>
        item.startsWith("最近喜欢")
      )
      .join("、") || "暂无";

    const dislikeContext = memoryDescriptions
      .filter((item: string) =>
        item.startsWith("最近拒绝")
      )
      .join("、") || "暂无";

    // 生成推荐规则
    const rules = generateRules(
      mood,
      mealTime,
      style,
      retry ? previousFood : undefined
    );

    // 生成时间上下文
    const timeInfo = getTimeInfo();
    const contextPrompt = generateContext(timeInfo, mealTime);

    const client = new OpenAI({
      apiKey:
        process.env.DASHSCOPE_API_KEY,

      baseURL:
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });

    const completion =
      await client.chat.completions.create({
        model: "qwen-turbo",

        messages: [
          {
            role: "system",

            content: `
你不是普通美食推荐器。

你是一个真正懂生活、
懂情绪、
懂体感、
懂时间场景的 AI Food Companion。

你的任务：

帮助年轻人减少"吃什么"的决策疲惫。

推荐必须：

- 有真实生活感
- 真正现实可吃到
- 不像外卖平台
- 不模板化
- 符合现实体感

非常重要：

"凉快"
不是字面意思。

而是：

- 清爽
- 降温感
- 夏天感
- 解腻
- 不厚重
- 不燥热
- 不刺激

因此：

如果用户选择：
"想吃凉快的"

禁止推荐：

- 火锅
- 麻辣烫
- 酸辣粉
- 重辣
- 热汤
- 重油
- 烧烤

应该优先推荐：

- 凉皮
- 冷面
- 寿司
- 沙拉
- 越南粉
- 冰粉
- 凉拌类
- 清爽面食

如果用户选择：
"没食欲"

优先推荐：

- 易入口
- 清淡
- 温和
- 小份感
- 恢复感

如果用户点击"换一换"：

必须明显不同。

禁止：

- 重复
- 同类
- 相似做法
- 相似口味

用户必须感觉：

"终于不是那个 AI 套路答案了。"
`,
          },

          {
            role: "user",

            content: `
${contextPrompt}

现在是：

${mealTime}

用户状态：

${mood}

用户想吃：

${style}

${rules.banReasons ? `当前推荐规则：

${rules.banReasons}

` : ""}

最近偏好记忆：

${memoryContext}

最近喜欢：

${likeContext}

最近拒绝：

${dislikeContext}

已经推荐过：

${history?.join("、") || "暂无"}

${retry && previousFood ? `用户刚刚拒绝了：${previousFood}，必须推荐明显不同的食物。` : ""}

请真正站在人类现实生活角度，推荐一个现在真的会想吃的东西。

重要约束：
- 必须严格遵守上述推荐规则。
- 禁止列表中的食物绝对不能推荐。
- 优先推荐列表中的关键词。
- 不能重复已推荐过的食物。
- 70% 符合近期偏好，30% 保留探索感。
${retry && previousFood ? `- 绝对不能重复推荐：${previousFood}` : ""}

严格返回 JSON：

{
  "food": "",
  "reason": ""
}
`,
          },
        ],

        temperature: 1.4,
      });

    const text =
      completion.choices[0].message.content;

    return Response.json({
      result: text,
    });
  } catch (error) {
    console.log(error);

    return Response.json({
      result: JSON.stringify({
        food: "奶茶",
        reason:
          "AI 刚刚短暂失联了。",
      }),
    });
  }
}
