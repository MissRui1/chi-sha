"use client";

import {
  useState,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { compressImage } from "@/lib/image";
import {
  exportMealWall,
  shareMealWall,
} from "@/lib/share";
import { getOrCreateUserId } from "@/lib/user";

type MemoryItem = {
  userId?: string;
  mealTime: string;
  mood: string;
  style: string;
  food: string;
  time: string;
  type: "like" | "dislike";
  imageUrl?: string;
};

type IdentifyResult = {
  isDish: boolean;
  dish: string;
  suggestion: string;
};

type CookResult = {
  dish: string;
  reason: string;
  ingredients: string[];
  steps: string[];
  tips: string;
};

type FateResult = {
  food: string;
  reason: string;
  source: string;
};

const defaultMenuDishes = [
  "番茄炒蛋",
  "青椒土豆丝",
  "可乐鸡翅",
  "红烧排骨",
  "宫保鸡丁",
  "鱼香肉丝",
  "麻婆豆腐",
  "西红柿牛腩",
  "清炒时蔬",
  "紫菜蛋花汤",
];

const fateFallbackFoods = [
  "番茄牛腩饭",
  "麻辣烫",
  "照烧鸡腿饭",
  "酸菜鱼",
  "日式咖喱饭",
  "越南牛肉粉",
  "虾仁滑蛋饭",
  "菌菇鸡汤面",
];

const pickRandom = <T,>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)];

const uniq = (items: string[]) =>
  items
    .map((item) => item.trim())
    .filter(
      (item, index, arr) =>
        item && arr.indexOf(item) === index
    );

const getClientContext = () => ({
  currentTime: new Date().toISOString(),
  timezone:
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "Asia/Shanghai",
});

const inferMealTime = () => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 10) return "早餐";
  if (hour >= 10 && hour < 15) return "午餐";
  if (hour >= 15 && hour < 17) return "奶茶";
  if (hour >= 22 || hour < 5) return "夜宵";

  return "晚餐";
};

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(value));

const ResultSkeleton = ({
  className = "",
}: {
  className?: string;
}) => (
  <div
    className={`skeleton-card p-8 ${className}`}
    aria-label="正在生成推荐"
  >
    <div className="skeleton-line w-24" />
    <div className="skeleton-line mt-5 h-10 w-3/5" />
    <div className="skeleton-line mt-6 w-full" />
    <div className="skeleton-line mt-3 w-5/6" />
    <div className="grid grid-cols-2 gap-4 mt-8">
      <div className="skeleton-line h-12 w-full" />
      <div className="skeleton-line h-12 w-full" />
    </div>
  </div>
);

const InlineSkeleton = () => (
  <div
    className="space-y-3"
    aria-label="正在生成内容"
  >
    <div className="skeleton-line w-1/3" />
    <div className="skeleton-line h-9 w-3/5" />
    <div className="skeleton-line w-full" />
    <div className="skeleton-line w-4/5" />
  </div>
);

const cleanJson = (str: string) =>
  str
    .replace(/^```json\n?/, "")
    .replace(/^```\n?/, "")
    .replace(/```$/, "")
    .trim();

const parseMemoryRecord = (
  item: string | MemoryItem
): MemoryItem => {
  if (typeof item === "string") {
    const parts = item.split(" · ");

    return {
      mealTime: parts[0] || "",
      mood: parts[1] || "",
      style: parts[2] || "",
    food: parts[3] || item,
      time: new Date().toISOString(),
      type: "like",
    };
  }

  return {
    userId: item.userId || "",
    mealTime: item.mealTime || "",
    mood: item.mood || "",
    style: item.style || "",
    food: item.food || "",
    time: item.time || new Date().toISOString(),
    type:
      item.type === "dislike"
        ? "dislike"
        : "like",
    imageUrl: item.imageUrl,
  };
};

const formatMemoryText = (
  items: MemoryItem[]
): string[] =>
  items.map((item) =>
    `${item.type === "dislike" ? "拒绝" : "喜欢"}：${item.mealTime} ${item.mood} ${item.style} ${item.food}`
  );

const buildInsights = (
  data: MemoryItem[]
): string[] => {
  const text = data
    .map(
      (item) =>
        `${item.mealTime} ${item.mood} ${item.style} ${item.food}`
    )
    .join(" ");

  const result: string[] = [];

  if (text.includes("奖励自己")) {
    result.push(
      "你最近很会认真生活。\n辛苦的时候，也记得给自己一点奖励。"
    );
  }

  if (text.includes("emo")) {
    result.push(
      "最近好像有点情绪化。\n先别逼自己，吃点舒服的就好。"
    );
  }

  if (text.includes("夜宵")) {
    result.push(
      "最近总在深夜打开 App。\n夜晚确实很适合来点热乎的。"
    );
  }

  if (text.includes("没食欲")) {
    result.push(
      "最近是不是有点疲惫？\n有时候能好好吃饭就已经很厉害了。"
    );
  }

  if (result.length === 0) {
    result.push(
      "AI 还在慢慢了解你。\n多来吃几顿吧。"
    );
  }

  return result;
};

const readMemory = (): MemoryItem[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const savedMemory =
      localStorage.getItem("memory");

    if (!savedMemory) {
      return [];
    }

    const parsed = JSON.parse(savedMemory);

    return Array.isArray(parsed)
      ? parsed.map(parseMemoryRecord)
      : [];
  } catch {
    return [];
  }
};

const readMenu = (): string[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const savedMenu =
      localStorage.getItem("myMenu");

    if (!savedMenu) {
      return defaultMenuDishes;
    }

    const parsed = JSON.parse(savedMenu);

    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string =>
            typeof item === "string"
        )
      : [];
  } catch {
    return [];
  }
};

const isThisWeek = (date: Date) => {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  start.setHours(0, 0, 0, 0);

  return date >= start;
};

const isThisMonth = (date: Date) => {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
};

const groupMeals = (items: MemoryItem[]) => {
  const liked = items
    .filter((item) => item.type === "like")
    .slice()
    .reverse();

  return [
    {
      title: "本周",
      items: liked.filter((item) =>
        isThisWeek(new Date(item.time))
      ),
    },
    {
      title: "本月",
      items: liked.filter((item) => {
        const date = new Date(item.time);
        return (
          isThisMonth(date) && !isThisWeek(date)
        );
      }),
    },
    {
      title: "更早",
      items: liked.filter(
        (item) =>
          !isThisMonth(new Date(item.time))
      ),
    },
  ].filter((group) => group.items.length > 0);
};

export default function Home() {
  const [page, setPage] = useState("today");

  const [mealTime, setMealTime] =
    useState(inferMealTime);

  const [mood, setMood] =
    useState<string[]>(["奖励自己"]);

  const [style, setStyle] =
    useState<string[]>(["中餐"]);

  const [userId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : getOrCreateUserId()
  );

  const [food, setFood] = useState("");

  const [reason, setReason] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [memory, setMemory] =
    useState<MemoryItem[]>(readMemory);

  const [insights, setInsights] =
    useState<string[]>(() =>
      buildInsights(readMemory())
    );

  const [inspirations, setInspirations] =
    useState<
      {
        title: string;
        desc: string;
      }[]
    >([]);

  // 我的菜单
  const [myMenu, setMyMenu] =
    useState<string[]>(readMenu);

  const [newDish, setNewDish] =
    useState("");

  // 做饭 AI
  const [cookResult, setCookResult] =
    useState<CookResult | null>(null);

  const [showCookRecipe, setShowCookRecipe] =
    useState(false);

  const [cookHistory, setCookHistory] =
    useState<string[]>([]);

  const [cookLoading, setCookLoading] =
    useState(false);

  const [identifyResult, setIdentifyResult] =
    useState<IdentifyResult | null>(null);

  const [identifyLoading, setIdentifyLoading] =
    useState(false);

  const [shareLoading, setShareLoading] =
    useState(false);

  const [fateLoading, setFateLoading] =
    useState(false);

  const [fateResult, setFateResult] =
    useState<FateResult | null>(null);

  const toggleValue = (
    value: string,
    setter: Dispatch<
      SetStateAction<string[]>
    >
  ) => {
    setter((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value]
    );
  };

  // 灵感 AI
  const generateInspirations =
    useCallback(async () => {
      try {
        const response =
          await fetch(
            "/api/inspiration",
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                userId,
                mood: mood.join("、"),
                mealTime,
                memory: formatMemoryText(memory),
              }),
            }
          );

        const data =
          await response.json();

        const parsed =
          JSON.parse(cleanJson(data.result));

        setInspirations(parsed);
      } catch (error) {
        console.log(error);
      }
    }, [mealTime, memory, mood, userId]);

  // 保存 memory
  const saveMemory = (
    newMemory: MemoryItem[]
  ) => {
    setMemory(newMemory);

    localStorage.setItem(
      "memory",
      JSON.stringify(newMemory)
    );

    setInsights(buildInsights(newMemory));
  };

  // 保存菜单
  const saveMenu = (
    newMenu: string[]
  ) => {
    const normalized = uniq(newMenu);

    setMyMenu(normalized);

    localStorage.setItem(
      "myMenu",
      JSON.stringify(normalized)
    );
  };

  // 添加菜
  const addDish = () => {
    const dish = newDish.trim();

    if (!dish) return;

    if (myMenu.includes(dish)) {
      toast.error("这道菜已经在菜单里了");
      return;
    }

    const updated = [
      ...myMenu,
      dish,
    ];

    saveMenu(updated);

    setNewDish("");
    toast.success("已加入我的菜单");
  };

  // 删除菜
  const deleteDish = (
    dish: string
  ) => {
    const updated = myMenu.filter(
      (item) => item !== dish
    );

    saveMenu(updated);
  };

  const spinFateBox = () => {
    if (fateLoading) return;

    setFateLoading(true);
    setFateResult(null);

    window.setTimeout(() => {
      const savedFoods = memory
        .filter((item) => item.type === "like")
        .map((item) => item.food);
      const menuFoods = myMenu;
      const pool = [
        ...savedFoods,
        ...menuFoods,
        ...fateFallbackFoods,
      ].filter((item, index, arr) =>
        item && arr.indexOf(item) === index
      );
      const picked = pickRandom(pool);
      const source = menuFoods.includes(picked)
        ? "从你的菜单抽中"
        : savedFoods.includes(picked)
          ? "从你的饮食日记抽中"
          : "命运临时塞来的";

      setFateResult({
        food: picked,
        source,
        reason: `${source}：${picked}。别再和选择题拉扯了，今天就让它落地。`,
      });
      setFateLoading(false);
    }, 1300);
  };

  const acceptFateResult = () => {
    if (!fateResult) return;

    setFood(fateResult.food);
    setReason(fateResult.reason);
    setPage("today");
  };

  // 首页 AI
  const generateFood = async (
    retry = false,
    currentMemory?: MemoryItem[]
  ) => {
    setLoading(true);

    const memorySource =
      currentMemory ?? memory;

    try {
      const response = await fetch(
        "/api/recommend",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            mealTime,
            userId,
            mood: mood.join("、"),
            style: style.join("、"),
            retry,
            previousFood: food,
            ...getClientContext(),
            history: memorySource
              .filter((item) => item.type === "like")
              .map((item) => item.food),
            memory: formatMemoryText(memorySource),
          }),
        }
      );

      const data =
        await response.json();

      const parsed =
        JSON.parse(cleanJson(data.result));

      setFood(parsed.food);

      setReason(parsed.reason);
    } catch (error) {
      console.log(error);
      toast.error("AI 刚刚有点忙，请再试一次");
    } finally {
      setLoading(false);
    }
  };

  // 做饭 AI
  const generateCookAI =
    async () => {
      if (myMenu.length === 0)
        return;

      setCookLoading(true);
      setShowCookRecipe(false);

      try {
        const response =
          await fetch("/api/cook", {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              mealTime,
              userId,
              mood: mood.join("、"),
              menu: myMenu,
              history: cookHistory,
              ...getClientContext(),
            }),
          });

        const data =
          await response.json();

        const parsed =
          JSON.parse(cleanJson(data.result));

        setCookResult(parsed);

        setCookHistory((prev) => [
          ...prev,
          parsed.dish,
        ]);
      } catch (error) {
        console.log(error);
        toast.error("做饭建议生成失败，请再试一次");
      } finally {
        setCookLoading(false);
      }
    };

  // 接受推荐
  const acceptFood = (imageUrl?: string) => {
    const updated: MemoryItem[] = [
      ...memory,
      {
        mealTime,
        userId,
        mood: mood.join("、"),
        style: style.join("、"),
        food,
        time: new Date().toISOString(),
        type: "like",
        imageUrl,
      },
    ];

    saveMemory(updated);

    toast.success("今天终于不用纠结了");
  };

  const acceptFoodWithPhoto = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      const imageUrl = await compressImage(file);
      acceptFood(imageUrl);
    } catch (error) {
      console.log(error);
      toast.error("照片处理失败，已保留文字记录");
      acceptFood();
    }
  };

  const declineFood = () => {
    if (!food) {
      generateFood(true);
      return;
    }

    const updated: MemoryItem[] = [
      ...memory,
      {
        mealTime,
        userId,
        mood: mood.join("、"),
        style: style.join("、"),
        food,
        time: new Date().toISOString(),
        type: "dislike",
      },
    ];

    saveMemory(updated);

    generateFood(true, updated);
  };

  const exportRecentMeals = async () => {
    setShareLoading(true);

    try {
      const blob = await exportMealWall(
        memory
          .filter((item) => item.type === "like")
          .map((item) => ({
            food: item.food,
            time: item.time,
            imageUrl: item.imageUrl,
          }))
      );

      await shareMealWall(blob);
      toast.success("饮食日记图片已生成");
    } catch (error) {
      console.log(error);
      toast.error("导出失败，请稍后再试");
    } finally {
      setShareLoading(false);
    }
  };

  const identifyFood = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setIdentifyLoading(true);

    try {
      const imageDataUrl = await compressImage(file);
      const response = await fetch("/api/identify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageDataUrl }),
      });
      const result =
        (await response.json()) as IdentifyResult;

      setIdentifyResult(result);
      if (result.isDish) {
        toast.success("识别完成");
      } else {
        toast.error("这张图不像菜品，请换一张菜的照片");
      }
    } catch (error) {
      console.log(error);
      toast.error("识菜失败，请换张清晰照片");
    } finally {
      setIdentifyLoading(false);
    }
  };

  const addIdentifiedDishToMenu = () => {
    if (!identifyResult?.isDish) return;

    if (myMenu.includes(identifyResult.dish)) {
      toast.error("这道菜已经在菜单里了");
      return;
    }

    saveMenu([...myMenu, identifyResult.dish]);
    toast.success("已加入我的菜单");
  };

  const useIdentifiedDishToday = () => {
    if (!identifyResult?.isDish) return;

    setFood(identifyResult.dish);
    setReason(identifyResult.suggestion);
    setPage("today");
  };

  return (
    <main className="app-shell min-h-screen pb-40">
      {/* 顶部 */}
      <div className="max-w-xl mx-auto px-6 pt-12">
        <h1 className="text-5xl font-semibold tracking-tight">
          {page === "menu" ? "做啥？" : "吃啥？"}
        </h1>

        <p className="muted-text mt-3 leading-7">
          {page === "menu"
            ? "今天在家就做这个。"
            : "今天终于不用纠结了。"}
        </p>
      </div>

      {/* 首页 */}
      {page === "today" && (
        <div className="max-w-xl mx-auto px-6 mt-10">
          <div className="surface-card p-8 space-y-10">
            {/* 时间 */}
            <div>
              <p className="text-sm text-gray-400 mb-4">
                现在吃哪顿？
              </p>

              <div className="flex flex-wrap gap-3">
                {[
                  "早餐",
                  "午餐",
                  "晚餐",
                  "夜宵",
                  "奶茶",
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() =>
                      setMealTime(item)
                    }
                    className={`chip-button ${
                      mealTime === item
                        ? "chip-button-active"
                        : ""
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* 情绪 */}
            <div>
              <p className="text-sm text-gray-400 mb-4">
                现在是什么状态？
              </p>

              <div className="flex flex-wrap gap-3">
                {[
                  "奖励自己",
                  "摆烂",
                  "减脂期",
                  "想吃热乎的",
                  "想吃凉快的",
                  "没食欲",
                  "emo",
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() =>
                      toggleValue(item, setMood)
                    }
                    className={`chip-button ${
                      mood.includes(item)
                        ? "chip-button-active"
                        : ""
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* 菜系 */}
            <div>
              <p className="text-sm text-gray-400 mb-4">
                想吃什么类型？
              </p>

              <div className="flex flex-wrap gap-3">
                {[
                  "中餐",
                  "韩餐",
                  "日料",
                  "西餐",
                  "快餐",
                  "随便",
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() =>
                      toggleValue(item, setStyle)
                    }
                    className={`chip-button ${
                      style.includes(item)
                        ? "chip-button-active"
                        : ""
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() =>
                generateFood(false)
              }
              disabled={loading}
              className="primary-button w-full py-4 text-lg"
            >
              帮我决定
            </button>
          </div>

          <button
            onClick={spinFateBox}
            disabled={fateLoading}
            className="fate-card mt-6 w-full text-left p-8"
          >
            <div className="flex items-center justify-between gap-5">
              <div>
                <p className="text-sm opacity-70 mb-3">
                  转盘盲盒模式
                </p>
                <h2 className="text-3xl font-semibold leading-tight">
                  完全交给命运
                </h2>
                <p className="mt-4 leading-8 opacity-80">
                  从菜单、日记和随机池里抽一道，停在哪道就吃哪道。
                </p>
              </div>

              <motion.div
                animate={
                  fateLoading
                    ? { rotate: 1080 }
                    : { rotate: 0 }
                }
                transition={{
                  duration: 1.25,
                  ease: "easeInOut",
                }}
                className="fate-wheel shrink-0"
              >
                <span />
              </motion.div>
            </div>
          </button>

          {fateLoading && (
            <div className="surface-card mt-6 p-8">
              <InlineSkeleton />
            </div>
          )}

          {fateResult && !fateLoading && (
            <button
              onClick={acceptFateResult}
              className="surface-card pressable mt-6 w-full text-left p-8"
            >
              <p className="text-sm text-gray-400 mb-3">
                {fateResult.source}
              </p>
              <h2 className="text-4xl font-semibold tracking-tight">
                {fateResult.food}
              </h2>
              <p className="muted-text mt-5 leading-8">
                点一下就把它放进今天的推荐结果。
              </p>
            </button>
          )}

          {loading && <ResultSkeleton className="mt-8" />}

          {/* 推荐结果 */}
          {food && !loading && (
            <div className="mt-8 surface-card p-8">
              <p className="text-sm text-gray-400 mb-3">
                AI 的建议
              </p>

              <h2 className="text-4xl font-semibold tracking-tight mb-5">
                {food}
              </h2>

              <p className="body-text leading-8 mb-8">
                {reason}
              </p>

              <div className="flex gap-4">
                <button
                  onClick={() => acceptFood()}
                  className="primary-button flex-1 py-3"
                >
                  就这个了
                </button>

                <button
                  onClick={declineFood}
                  className="secondary-button flex-1 py-3"
                >
                  换一换
                </button>
              </div>

              <label className="secondary-button mt-4 block text-center py-3 cursor-pointer">
                添加照片记录
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={acceptFoodWithPhoto}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* 饮食日记 */}
      {page === "recent" && (
        <div className="max-w-xl mx-auto px-6 mt-10 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-3xl font-semibold">
                饮食日记
              </h2>
              <p className="muted-text mt-2">
                认真吃过的都算数。
              </p>
            </div>

            <button
              onClick={exportRecentMeals}
              disabled={shareLoading}
              className="primary-button px-4 py-3 disabled:opacity-40"
            >
              {shareLoading ? "生成中" : "导出"}
            </button>
          </div>

          {memory.filter(
            (item) => item.type === "like"
          ).length === 0 && (
            <div className="surface-card p-8 muted-text">
              还没有记录，今天去吃点什么吧
            </div>
          )}

          <div id="meal-wall">
            {groupMeals(memory).map((group) => (
              <section key={group.title}>
              <h3 className="text-sm text-gray-400 mb-3">
                {group.title}
              </h3>

              <div className="columns-2 gap-3">
                {group.items.map((item) => (
                  <div
                    key={`${item.food}-${item.time}`}
                    className="mb-3 break-inside-avoid surface-card overflow-hidden"
                  >
                    {item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.food}
                        className="w-full object-cover"
                      />
                    )}

                    <div className="p-4">
                      <h4 className="font-semibold leading-tight">
                        {item.food}
                      </h4>
                      <p className="text-xs muted-text mt-2">
                        {formatDateTime(item.time)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              </section>
            ))}
          </div>

          {insights.map((item, index) => {
            const lines = item.split("\n");

            return (
              <div
                key={index}
                className="surface-card p-8"
              >
                <h2 className="text-3xl font-semibold leading-tight">
                  {lines[0]}
                </h2>

                <p className="muted-text mt-5 leading-8">
                  {lines[1]}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* 我的菜单 */}
      {page === "menu" && (
        <div className="max-w-xl mx-auto px-6 mt-10 space-y-6">
          {/* AI 推荐 */}
          <div className="surface-card p-8">
            <p className="text-sm text-gray-400 mb-4">
              今晚做什么
            </p>

            {cookResult ? (
              <>
                <h2 className="text-4xl font-semibold tracking-tight">
                  {cookResult.dish}
                </h2>

                <p className="muted-text mt-5 leading-8">
                  {cookResult.reason}
                </p>

                <div className="flex gap-4 mt-8">
                  <button
                    onClick={() =>
                      setShowCookRecipe(true)
                    }
                    className="primary-button flex-1 py-3"
                  >
                    就做这个
                  </button>

                  <button
                    onClick={
                      generateCookAI
                    }
                    className="secondary-button flex-1 py-3"
                  >
                    换一个
                  </button>
                </div>

                {showCookRecipe && (
                  <div className="inset-card mt-6 p-5 space-y-5">
                    <div>
                      <h3 className="font-semibold mb-3">
                        食材
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {cookResult.ingredients.map(
                          (item) => (
                            <span
                              key={item}
                              className="recipe-chip"
                            >
                              {item}
                            </span>
                          )
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-3">
                        做法
                      </h3>
                      <ol className="space-y-3">
                        {cookResult.steps.map(
                          (step, index) => (
                            <li
                              key={step}
                              className="recipe-step"
                            >
                              <span>{index + 1}</span>
                              <p>{step}</p>
                            </li>
                          )
                        )}
                      </ol>
                    </div>

                    <p className="muted-text leading-7">
                      {cookResult.tips}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="muted-text mb-6">
                  让 AI 从你的菜单里帮你决定今晚做什么。
                </p>

                {cookLoading && (
                  <div className="mb-6">
                    <InlineSkeleton />
                  </div>
                )}

                <button
                  onClick={
                    generateCookAI
                  }
                  disabled={
                    myMenu.length === 0 || cookLoading
                  }
                  className="primary-button w-full py-4 disabled:opacity-30"
                >
                  帮我决定今晚做什么
                </button>
              </>
            )}
          </div>

          {/* 我的菜 */}
          <div className="surface-card p-8">
            <p className="text-sm text-gray-400 mb-5">
              我的菜
            </p>

            <div className="mb-6">
              <p className="text-sm text-gray-400 mb-3">
                家常菜快捷添加
              </p>
              <div className="flex flex-wrap gap-2">
                {defaultMenuDishes.map((dish) => (
                  <button
                    key={dish}
                    onClick={() => {
                      if (myMenu.includes(dish)) {
                        toast.error("这道菜已经在菜单里了");
                        return;
                      }

                      saveMenu([...myMenu, dish]);
                    }}
                    disabled={myMenu.includes(dish)}
                    className="quick-dish-button disabled:opacity-35"
                  >
                    {dish}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mb-6">
              <input
                value={newDish}
                onChange={(e) =>
                  setNewDish(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    addDish();
                  }
                }}
                placeholder="输入一道你会做的菜"
                className="app-input flex-1 px-5 py-4"
              />

              <button
                onClick={addDish}
                className="primary-button px-5"
              >
                添加
              </button>
            </div>

            {myMenu.length === 0 ? (
              <div className="empty-state p-6">
                <h3 className="font-semibold">
                  菜单还是空的
                </h3>
                <p className="muted-text mt-2 leading-7">
                  先加几道常做的菜，AI 才能帮你从家常选项里做决定。
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {myMenu.map((dish) => (
                  <motion.div
                    key={dish}
                    layout
                    className="menu-row px-5 py-4 flex justify-between items-center"
                  >
                    <span>{dish}</span>

                    <button
                      onClick={() =>
                        deleteDish(dish)
                      }
                      className="delete-button"
                    >
                      删除
                    </button>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          <div className="surface-card p-8">
            <h2 className="text-3xl font-semibold leading-tight">
              拍照识菜
            </h2>
            <p className="muted-text mt-5 leading-8">
              只识别菜品和餐食，识别后可以加入我的菜单。
            </p>

            <label className="primary-button mt-6 block text-center py-4 cursor-pointer">
              上传或拍照
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={identifyFood}
                className="hidden"
              />
            </label>

            {identifyLoading && (
              <div className="mt-6">
                <InlineSkeleton />
              </div>
            )}

            {identifyResult && (
              <div className="mt-6 inset-card p-5">
                <p className="text-sm text-gray-400 mb-2">
                  识别结果
                </p>
                <h3 className="text-2xl font-semibold">
                  {identifyResult.dish}
                </h3>
                <p className="muted-text mt-3 leading-7">
                  {identifyResult.suggestion}
                </p>

                {identifyResult.isDish && (
                  <div className="flex gap-3 mt-5">
                    <button
                      onClick={addIdentifiedDishToMenu}
                      className="primary-button flex-1 py-3"
                    >
                      加入菜单
                    </button>
                    <button
                      onClick={useIdentifiedDishToday}
                      className="secondary-button flex-1 py-3"
                    >
                      今天就吃
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 灵感 */}
      {page === "discover" && (
        <div className="max-w-xl mx-auto px-6 mt-10 space-y-5">
          <button
            onClick={() =>
              void generateInspirations()
            }
            className="primary-button w-full py-4 text-lg"
          >
            生成今日灵感
          </button>

          {inspirations.map(
            (item, index) => (
              <button
                key={index}
                onClick={() => {
                  setMood([item.title]);

                  setPage("today");
                }}
                className="surface-card pressable w-full text-left p-8"
              >
                <h2 className="text-3xl font-semibold leading-tight">
                  {item.title}
                </h2>

                <p className="muted-text mt-5 leading-8">
                  {item.desc}
                </p>
              </button>
            )
          )}
        </div>
      )}

      {/* 底部导航 */}
      <div className="fixed bottom-0 left-0 w-full">
        <div className="max-w-xl mx-auto px-6 pb-6">
          <div className="tab-bar flex justify-around py-4">
            <button
              onClick={() =>
                setPage("today")
              }
              className={`tab-item ${
                page === "today"
                  ? "tab-item-active"
                  : ""
              }`}
            >
              <span className="tab-dot" />
              今天吃啥
            </button>

            <button
              onClick={() =>
                setPage("recent")
              }
              className={`tab-item ${
                page === "recent"
                  ? "tab-item-active"
                  : ""
              }`}
            >
              <span className="tab-dot" />
              最近
            </button>

            <button
              onClick={() =>
                setPage("menu")
              }
              className={`tab-item ${
                page === "menu"
                  ? "tab-item-active"
                  : ""
              }`}
            >
              <span className="tab-dot" />
              我的菜单
            </button>

            <button
              onClick={() =>
                setPage("discover")
              }
              className={`tab-item ${
                page === "discover"
                  ? "tab-item-active"
                  : ""
              }`}
            >
              <span className="tab-dot" />
              灵感
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
