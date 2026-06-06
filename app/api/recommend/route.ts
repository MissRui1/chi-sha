import { z } from "zod";
import { createAiClient, getAiModel } from "@/lib/ai";
import { runJsonPrompt } from "@/lib/prompt-harness";
import {
  curatedDishNames,
  curatedDrinkNames,
  isKnownFoodName,
} from "@/lib/dish-database";

type RecommendationRules = {
  bannedFoods: string[];
  preferredKeywords: string[];
  banReasons: string;
};

type MemoryPayload =
  | string
  | {
      type?: "like" | "dislike";
      mealTime?: string;
      mood?: string | string[];
      style?: string | string[];
      food?: string;
    };

const StringOrArraySchema = z.union([
  z.string().max(600),
  z.array(z.string().max(80)).max(60),
]);

const MemorySchema = z.union([
  z.string(),
  z
    .object({
      type: z.enum(["like", "dislike"]).optional(),
      mealTime: z.string().max(20).optional(),
      mood: StringOrArraySchema.optional(),
      style: StringOrArraySchema.optional(),
      food: z.string().max(80).optional(),
    })
    .passthrough(),
]);

const RecommendRequestSchema = z.object({
  userId: z.string().optional(),
  mealTime: z.string().optional(),
  mood: StringOrArraySchema.optional(),
  style: StringOrArraySchema.optional(),
  retry: z.boolean().optional(),
  previousFood: z.string().optional(),
  history: z.array(z.string().max(80)).max(80).optional(),
  memory: z.array(MemorySchema).max(120).optional(),
  currentTime: z.string().optional(),
  timezone: z.string().optional(),
});

const RecommendSchema = z.object({
  food: z.string().min(1),
  reason: z.string().min(1),
});

const normalizeList = (
  value: string | string[] | undefined,
  fallback: string
): string[] => {
  const source = Array.isArray(value)
    ? value
    : (value ?? fallback).split(/[、,，]/);

  const normalized = source
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0
    ? normalized
    : [fallback];
};

const validateRecommendation = (
  parsed: z.infer<typeof RecommendSchema>,
  rules: RecommendationRules,
  mealTime: string,
  history: string[]
) => {
  const allowedPool =
    mealTime === "奶茶" ? curatedDrinkNames : curatedDishNames;

  if (!isKnownFoodName(parsed.food, allowedPool)) {
    throw new Error(
      `AI returned unknown food: ${parsed.food}`
    );
  }

  if (mealTime !== "奶茶") {
    const banned = rules.bannedFoods.find(
      (food) =>
        parsed.food.includes(food) ||
        parsed.reason.includes(food)
    );

    if (banned) {
      throw new Error(
        `AI returned banned food: ${banned}`
      );
    }
  }

  const repeated = history.find((food) =>
    food && parsed.food.includes(food)
  );

  if (repeated) {
    throw new Error(
      `AI repeated existing history: ${repeated}`
    );
  }
};

const generateRules = (
  moodList: string[],
  mealTime: string,
  previousFood?: string
): RecommendationRules => {
  const rules: RecommendationRules = {
    bannedFoods: [],
    preferredKeywords: [],
    banReasons: "",
  };

  const banParts: string[] = [];
  const prefixParts: string[] = [];
  const hasMood = (value: string) =>
    moodList.includes(value);

  if (hasMood("想吃凉快的")) {
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

  if (hasMood("没食欲")) {
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

  if (
    hasMood("奖励自己") &&
    mealTime === "晚餐" &&
    !hasMood("减脂期")
  ) {
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

  if (hasMood("减脂期")) {
    rules.bannedFoods.push(
      "炸鸡",
      "高糖",
      "高油",
      "肥肉",
      "甜品",
      "油炸"
    );

    if (mealTime !== "奶茶") {
      rules.bannedFoods.push("奶茶");
    }

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
      mealTime === "奶茶"
        ? "减脂期优先级最高：禁止全糖、高糖、高脂奶茶，必须推荐低糖或无糖方案"
        : "减脂期优先级最高：禁止推荐炸鸡、奶茶、高糖、高油、肥肉、甜品、油炸类"
    );
    prefixParts.push(
      "优先推荐：沙拉、鸡胸肉、三明治、健康碗、低脂类"
    );
  }

  if (mealTime === "早餐") {
    rules.bannedFoods.push(
      "火锅",
      "烧烤",
      "烤肉",
      "麻辣烫",
      "正餐套餐"
    );
    rules.preferredKeywords.push(
      "包子",
      "粥",
      "豆浆油条",
      "三明治",
      "肠粉",
      "煎饼果子",
      "热干面"
    );
    banParts.push(
      "早餐专属约束：禁止推荐晚餐食物（火锅、烧烤、烤肉、正餐套餐类）"
    );
    prefixParts.push(
      "早餐优先推荐：包子、粥、豆浆油条、三明治、肠粉、煎饼果子、热干面等真实早餐"
    );
  }

  if (mealTime === "奶茶") {
    prefixParts.push(
      "奶茶专属约束：只推荐具体奶茶、果茶或茶饮品类，不推荐饭菜或小吃"
    );
  }

  if (previousFood) {
    rules.bannedFoods.push(previousFood);
    banParts.push(`绝对禁止推荐：${previousFood}`);
  }

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
  minute: number;
  second: number;
  dayOfWeek: number;
  month: number;
  localText: string;
  timeOfDay: "早餐" | "下午" | "深夜" | "正餐";
  dayName: string;
};

const readNumberPart = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
) =>
  Number(
    parts.find((part) => part.type === type)?.value ?? 0
  );

const getTimeInfo = (
  currentTime?: string,
  timezone = "Asia/Shanghai"
): TimeContext => {
  const parsed = currentTime
    ? new Date(currentTime)
    : new Date();
  const now = Number.isNaN(parsed.getTime())
    ? new Date()
    : parsed;
  let safeTimezone = timezone;
  let parts: Intl.DateTimeFormatPart[];

  try {
    parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: safeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
  } catch {
    safeTimezone = "Asia/Shanghai";
    parts = new Intl.DateTimeFormat("zh-CN", {
      timeZone: safeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
      hour12: false,
    }).formatToParts(now);
  }

  const hour = readNumberPart(parts, "hour");
  const minute = readNumberPart(parts, "minute");
  const second = readNumberPart(parts, "second");
  const month = readNumberPart(parts, "month");
  const dayName =
    parts.find((part) => part.type === "weekday")
      ?.value ?? "今天";

  const dayNames = [
    "周日",
    "周一",
    "周二",
    "周三",
    "周四",
    "周五",
    "周六",
  ];
  const dayOfWeek = Math.max(0, dayNames.indexOf(dayName));

  let timeOfDay: TimeContext["timeOfDay"] =
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
    minute,
    second,
    dayOfWeek,
    month,
    localText: new Intl.DateTimeFormat("zh-CN", {
      timeZone: safeTimezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(now),
    timeOfDay,
    dayName,
  };
};

const getWeatherContext = (month: number): string => {
  if (month >= 6 && month <= 9) {
    return "夏季：推荐冷面、清爽、冷食、水果类，避免厚重热辣";
  }

  if (month === 11 || month === 12 || month <= 2) {
    return "冬季：推荐汤类、火锅、热面、热食";
  }

  if (
    (month >= 3 && month <= 5) ||
    month === 10
  ) {
    return "春秋季：温和舒适，兼容各类食物";
  }

  return "";
};

const generateContext = (
  timeInfo: TimeContext,
  mealTime: string
): string => {
  const contextParts: string[] = [];

  contextParts.push("【场景信息】");
  contextParts.push(
    `真实当前时间：${timeInfo.localText} ${timeInfo.dayName}`
  );
  contextParts.push(
    `真实时段判断：${timeInfo.timeOfDay}（${timeInfo.hour}:${String(timeInfo.minute).padStart(2, "0")}:${String(timeInfo.second).padStart(2, "0")}）`
  );

  let mealTimeDesc = "";

  if (mealTime === "早餐") {
    mealTimeDesc =
      "现在是早餐时间：早餐专属约束：禁止推荐晚餐食物（火锅、烧烤、正餐类）。优先推荐：包子、粥、豆浆油条、三明治、肠粉、煎饼果子、热干面等真实早餐。";
  } else if (mealTime === "午餐") {
    mealTimeDesc =
      "现在是午餐时间：推荐营养均衡、满足感适中的选项";
  } else if (mealTime === "奶茶") {
    mealTimeDesc =
      "用户现在想喝奶茶：推荐具体奶茶品类、口味、糖度建议，而不是食物。例如：茉莉奶绿、半糖、去冰。";
  } else if (mealTime === "晚餐") {
    mealTimeDesc =
      "现在是晚餐时间：推荐满足感强、容易获得的选项";
  } else if (mealTime === "夜宵") {
    mealTimeDesc =
      "现在是夜宵时间：提高夜宵、满足感、热食的偏好，避免太清淡的选项";
  } else if (timeInfo.timeOfDay === "早餐") {
    mealTimeDesc =
      "现在是早餐时间：优先推荐快速、热乎、容易获得的选项";
  } else if (timeInfo.timeOfDay === "下午") {
    mealTimeDesc =
      "现在是下午：推荐轻食、小满足、下午茶感的食物";
  } else if (timeInfo.timeOfDay === "深夜") {
    mealTimeDesc =
      "现在是深夜：提高夜宵、满足感、热食的偏好，避免太清淡的选项";
  }

  if (mealTimeDesc) {
    contextParts.push(mealTimeDesc);
  }

  contextParts.push(
    `用户手动选择的目标餐次：${mealTime}。如果它和真实时段不一致，推荐仍以用户选择为主，但理由里不能写错真实时间。`
  );

  if (timeInfo.dayOfWeek === 5) {
    contextParts.push(
      "现在是周五：用户倾向奖励自己，推荐烤肉、火锅等大满足食物"
    );
  } else if (timeInfo.dayOfWeek === 1) {
    contextParts.push(
      "现在是周一：推荐简单、热乎、不费脑的选项，避免太复杂或太罪恶的食物"
    );
  }

  const weatherContext = getWeatherContext(
    timeInfo.month
  );

  if (weatherContext) {
    contextParts.push(`【季节背景】${weatherContext}`);
  }

  return contextParts.join("\n");
};

const formatMemory = (memory: MemoryPayload[]) =>
  memory.map((item) => {
    if (typeof item === "string") {
      return item;
    }

    const type =
      item.type === "dislike"
        ? "最近拒绝"
        : "最近喜欢";

    const mood = normalizeList(
      item.mood,
      ""
    ).join("、");
    const style = normalizeList(
      item.style,
      ""
    ).join("、");

    return `${type}：${item.mealTime ?? ""} / ${mood} / ${style} / ${item.food ?? ""}`;
  });

const fallbackRecommendation = (
  mealTime: string,
  moodList: string[],
  avoidFoods: string[] = []
) => {
  const avoid = new Set(
    avoidFoods.map((item) =>
      item.replace(/\s+/g, "").toLowerCase()
    )
  );
  const pick = (
    items: Array<{ food: string; reason: string }>
  ) =>
    items.find(
      (item) =>
        !avoid.has(
          item.food.replace(/\s+/g, "").toLowerCase()
        )
    ) ?? items[0];

  if (mealTime === "奶茶") {
    return pick([
      {
        food: "茉莉奶绿",
        reason:
          moodList.includes("减脂期")
            ? "建议无糖或三分糖、去冰，配料少一点，满足奶茶欲望也别太有负担。"
            : "建议半糖、去冰，茶香清爽，不会太腻。",
      },
      {
        food: "鸭屎香柠檬茶",
        reason:
          "茶香明显又清爽，建议少糖少冰，适合想喝点提神但不想太腻的时候。",
      },
    ]);
  }

  if (mealTime === "早餐") {
    return pick([
      {
        food: "豆浆油条",
        reason:
          "真实早餐、热乎、容易买到，今天先用熟悉的一口把状态打开。",
      },
      {
        food: "鲜肉小馄饨",
        reason:
          "早上吃一碗热乎的更稳，份量不夸张，也不用太费劲做决定。",
      },
    ]);
  }

  if (moodList.includes("减脂期")) {
    return pick([
      {
        food: "鸡胸肉沙拉",
        reason:
          "低负担、清爽，也能吃饱，不会打乱今天的减脂节奏。",
      },
      {
        food: "虾仁糙米饭",
        reason:
          "蛋白质和主食都稳，吃完不容易犯困，也不会太折腾今天的计划。",
      },
    ]);
  }

  return pick([
    {
      food: "热汤面",
      reason:
        "AI 刚刚短暂失联了，先给你一个稳定、热乎、现实可吃到的选择。",
    },
    {
      food: "黄焖鸡米饭",
      reason:
        "这是很现实的一餐，热乎、有主食也有菜，适合先把选择压力放下来。",
    },
    {
      food: "三鲜馄饨",
      reason:
        "今天先来一碗清爽热乎的，负担不重，也能认真把这一顿吃好。",
    },
  ]);
};

const getTemperature = (mealTime: string) =>
  mealTime === "早餐" || mealTime === "午餐"
    ? 0.9
    : mealTime === "奶茶"
      ? 0.8
      : 1.2;

export async function POST(req: Request) {
  try {
    const body = RecommendRequestSchema.parse(
      await req.json()
    );

    const mealTime = body.mealTime ?? "晚餐";
    const moodList = normalizeList(
      body.mood,
      "奖励自己"
    );
    const styleList = normalizeList(
      body.style,
      "中餐"
    );
    const moodStr = moodList.join("、");
    const styleStr = styleList.join("、");
    const memoryList = body.memory ?? [];
    const memoryDescriptions =
      formatMemory(memoryList);
    const memoryContext =
      memoryDescriptions.join("、") || "暂无";
    const likeContext =
      memoryDescriptions
        .filter((item) =>
          item.startsWith("最近喜欢")
        )
        .join("、") || "暂无";
    const dislikeContext =
      memoryDescriptions
        .filter((item) =>
          item.startsWith("最近拒绝")
        )
        .join("、") || "暂无";

    const rules = generateRules(
      moodList,
      mealTime,
      body.retry ? body.previousFood : undefined
    );
    const history = body.history ?? [];
    const contextPrompt = generateContext(
      getTimeInfo(body.currentTime, body.timezone),
      mealTime
    );
    const historyText =
      history.join("、") || "暂无";
    const dishPool =
      mealTime === "奶茶" ? curatedDrinkNames : curatedDishNames;
    const dishPoolText = dishPool.join("、");
    const retryText =
      body.retry && body.previousFood
        ? `用户刚刚拒绝了：${body.previousFood}，必须推荐明显不同的食物。`
        : "";

    const systemPrompt = `
你是“吃啥”的推荐决策引擎，只负责输出可执行的一餐建议。

质量准则：
1. 严格依据真实当前时间、用户手动选择的餐次、用户状态、想吃类型、近期喜欢/拒绝记录综合判断。
2. 如果真实时间与用户选择不一致，不能编造时间；理由要自然地体现“按用户选择来，但知道现在真实时段”。
3. 食物必须现实可获得、名称具体，不输出抽象类别。
4. 理由 36-90 个中文字符，直接、生活化、无鸡汤、无平台广告感。
5. 禁止重复已推荐、已拒绝或本次换一换前的食物。
6. food 必须逐字来自“允许菜品池”，不能自创菜名或输出同一菜的少油/低脂变体。
7. 只返回 JSON，不要 markdown，不要额外字段。

奶茶专属：
- mealTime 为“奶茶”时 food 只能是具体茶饮名称。
- reason 必须包含糖度/温度/配料建议，不得推荐饭菜或小吃。

凉快专属：
- 用户状态包含“想吃凉快的”时，必须清爽、降温、解腻，禁止热汤、火锅、麻辣烫、烧烤、重油重辣。`;

    const userPrompt = `
${contextPrompt}

现在是：
${mealTime}

用户状态：
${moodStr}

用户想吃：
${styleStr}

允许菜品池：
${dishPoolText}

${rules.banReasons ? `当前推荐规则：\n${rules.banReasons}\n` : ""}

最近偏好记忆：
${memoryContext}

最近喜欢：
${likeContext}

最近拒绝：
${dislikeContext}

已经推荐过：
${historyText}

${retryText}

请真正站在人类现实生活角度，推荐一个现在真的会想吃的东西。

重要约束：
- 必须严格遵守上述推荐规则。
- food 必须逐字来自允许菜品池。
- 禁止列表中的食物绝对不能推荐。
- 优先推荐列表中的关键词。
- 不能重复已推荐过的食物。
- 70% 符合近期偏好，30% 保留探索感。
${body.retry && body.previousFood ? `- 绝对不能重复推荐：${body.previousFood}` : ""}

严格返回 JSON：
{
  "food": "",
  "reason": ""
}`;

    const client = createAiClient();
    const model = getAiModel();

    const parsed = await runJsonPrompt({
      client,
      model,
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
      schema: RecommendSchema,
      fallback: fallbackRecommendation(
        mealTime,
        moodList,
        history
      ),
      temperature: getTemperature(mealTime),
      maxAttempts: 3,
      throwOnFailure: true,
      validate: (value) =>
        validateRecommendation(
          value,
          rules,
          mealTime,
          history
        ),
    });

    return Response.json({
      result: JSON.stringify(parsed),
    });
  } catch (error) {
    console.log(error);

    return Response.json(
      {
        ok: false,
        result: JSON.stringify(
          fallbackRecommendation("晚餐", [
            "奖励自己",
          ])
        ),
      },
      { status: 503 }
    );
  }
}
