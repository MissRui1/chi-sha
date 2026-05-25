"use client";

import { useState, useEffect } from "react";

type MemoryItem = {
  mealTime: string;
  mood: string;
  style: string;
  food: string;
  time: string;
  type: "like" | "dislike";
};

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
    mealTime: item.mealTime || "",
    mood: item.mood || "",
    style: item.style || "",
    food: item.food || "",
    time: item.time || new Date().toISOString(),
    type:
      item.type === "dislike"
        ? "dislike"
        : "like",
  };
};

const formatMemoryText = (
  items: MemoryItem[]
): string[] =>
  items.map((item) =>
    `${item.type === "dislike" ? "拒绝" : "喜欢"}：${item.mealTime} ${item.mood} ${item.style} ${item.food}`
  );

export default function Home() {
  const [page, setPage] = useState("today");

  const [mealTime, setMealTime] =
    useState("晚餐");

  const [mood, setMood] =
    useState("奖励自己");

  const [style, setStyle] =
    useState("中餐");

  const [food, setFood] = useState("");

  const [reason, setReason] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [memory, setMemory] =
    useState<MemoryItem[]>([]);

  const [insights, setInsights] =
    useState<string[]>([]);

  const [inspirations, setInspirations] =
    useState<
      {
        title: string;
        desc: string;
      }[]
    >([]);

  // 我的菜单
  const [myMenu, setMyMenu] =
    useState<string[]>([]);

  const [newDish, setNewDish] =
    useState("");

  // 做饭 AI
  const [cookSuggestion, setCookSuggestion] =
    useState("");

  const [cookReason, setCookReason] =
    useState("");

  const [cookHistory, setCookHistory] =
    useState<string[]>([]);

  const [cookLoading, setCookLoading] =
    useState(false);

  // 初始化
  useEffect(() => {
    const savedMemory =
      localStorage.getItem("memory");

    if (savedMemory) {
      const parsed = JSON.parse(savedMemory);

      const normalized = Array.isArray(parsed)
        ? parsed.map(parseMemoryRecord)
        : [];

      setMemory(normalized);

      generateInsights(normalized);
    }

    const savedMenu =
      localStorage.getItem("myMenu");

    if (savedMenu) {
      const parsedMenu =
        JSON.parse(savedMenu);

      setMyMenu(parsedMenu);
    }

    generateInspirations();
  }, []);

  // 最近观察
  const generateInsights = (
    data: MemoryItem[]
  ) => {
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

    setInsights(result);
  };

  // 灵感 AI
  const generateInspirations =
    async () => {
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
                mood,
                mealTime,
                memory: formatMemoryText(memory),
              }),
            }
          );

        const data =
          await response.json();

        const parsed =
          JSON.parse(data.result);

        setInspirations(parsed);
      } catch (error) {
        console.log(error);
      }
    };

  // 保存 memory
  const saveMemory = (
    newMemory: MemoryItem[]
  ) => {
    setMemory(newMemory);

    localStorage.setItem(
      "memory",
      JSON.stringify(newMemory)
    );

    generateInsights(newMemory);
  };

  // 保存菜单
  const saveMenu = (
    newMenu: string[]
  ) => {
    setMyMenu(newMenu);

    localStorage.setItem(
      "myMenu",
      JSON.stringify(newMenu)
    );
  };

  // 添加菜
  const addDish = () => {
    if (!newDish.trim()) return;

    const updated = [
      ...myMenu,
      newDish,
    ];

    saveMenu(updated);

    setNewDish("");
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
            mood,
            style,
            retry,
            previousFood: food,
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
        JSON.parse(data.result);

      setFood(parsed.food);

      setReason(parsed.reason);
    } catch (error) {
      console.log(error);
    }

    setLoading(false);
  };

  // 做饭 AI
  const generateCookAI =
    async () => {
      if (myMenu.length === 0)
        return;

      setCookLoading(true);

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
              mood,
              menu: myMenu,
              history: cookHistory,
            }),
          });

        const data =
          await response.json();

        const parsed =
          JSON.parse(data.result);

        setCookSuggestion(
          parsed.dish
        );

        setCookReason(
          parsed.reason
        );

        setCookHistory((prev) => [
          ...prev,
          parsed.dish,
        ]);
      } catch (error) {
        console.log(error);
      }

      setCookLoading(false);
    };

  // 接受推荐
  const acceptFood = () => {
    const updated: MemoryItem[] = [
      ...memory,
      {
        mealTime,
        mood,
        style,
        food,
        time: new Date().toISOString(),
        type: "like",
      },
    ];

    saveMemory(updated);

    alert("今天终于不用纠结了 ✨");
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
        mood,
        style,
        food,
        time: new Date().toISOString(),
        type: "dislike",
      },
    ];

    saveMemory(updated);

    generateFood(true, updated);
  };

  return (
    <main className="min-h-screen bg-[#f5f5f7] text-black pb-40">
      {/* 顶部 */}
      <div className="max-w-xl mx-auto px-6 pt-12">
        <h1 className="text-5xl font-semibold tracking-tight">
          吃啥？
        </h1>

        <p className="text-gray-500 mt-3 leading-7">
          今天终于不用纠结了。
        </p>
      </div>

      {/* 首页 */}
      {page === "today" && (
        <div className="max-w-xl mx-auto px-6 mt-10">
          <div className="bg-white rounded-[32px] p-8 shadow-sm space-y-10">
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
                ].map((item) => (
                  <button
                    key={item}
                    onClick={() =>
                      setMealTime(item)
                    }
                    className={`px-5 py-2 rounded-full transition-all ${
                      mealTime === item
                        ? "bg-black text-white"
                        : "bg-[#f2f2f2]"
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
                      setMood(item)
                    }
                    className={`px-5 py-2 rounded-full transition-all ${
                      mood === item
                        ? "bg-black text-white"
                        : "bg-[#f2f2f2]"
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
                      setStyle(item)
                    }
                    className={`px-5 py-2 rounded-full transition-all ${
                      style === item
                        ? "bg-black text-white"
                        : "bg-[#f2f2f2]"
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
              className="w-full bg-black text-white py-4 rounded-2xl text-lg"
            >
              {loading
                ? "AI 正在思考..."
                : "帮我决定"}
            </button>
          </div>

          {/* 推荐结果 */}
          {food && (
            <div className="mt-8 bg-white rounded-[32px] p-8 shadow-sm">
              <p className="text-sm text-gray-400 mb-3">
                AI 的建议
              </p>

              <h2 className="text-4xl font-semibold tracking-tight mb-5">
                {food}
              </h2>

              <p className="text-gray-600 leading-8 mb-8">
                {reason}
              </p>

              <div className="flex gap-4">
                <button
                  onClick={acceptFood}
                  className="flex-1 bg-black text-white py-3 rounded-2xl"
                >
                  就这个了
                </button>

                <button
                  onClick={declineFood}
                  className="flex-1 bg-[#f2f2f2] py-3 rounded-2xl"
                >
                  换一换
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 最近 */}
      {page === "recent" && (
        <div className="max-w-xl mx-auto px-6 mt-10 space-y-5">
          {insights.map(
            (item, index) => {
              const lines =
                item.split("\n");

              return (
                <div
                  key={index}
                  className="bg-white rounded-[32px] p-8 shadow-sm"
                >
                  <h2 className="text-3xl font-semibold leading-tight">
                    {lines[0]}
                  </h2>

                  <p className="text-gray-500 mt-5 leading-8">
                    {lines[1]}
                  </p>
                </div>
              );
            }
          )}
        </div>
      )}

      {/* 我的菜单 */}
      {page === "menu" && (
        <div className="max-w-xl mx-auto px-6 mt-10 space-y-6">
          {/* AI 推荐 */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm">
            <p className="text-sm text-gray-400 mb-4">
              今晚做什么
            </p>

            {cookSuggestion ? (
              <>
                <h2 className="text-4xl font-semibold tracking-tight">
                  {cookSuggestion}
                </h2>

                <p className="text-gray-500 mt-5 leading-8">
                  {cookReason}
                </p>

                <div className="flex gap-4 mt-8">
                  <button
                    onClick={() =>
                      alert(
                        "今天终于不用纠结了 ✨"
                      )
                    }
                    className="flex-1 bg-black text-white py-3 rounded-2xl"
                  >
                    就做这个
                  </button>

                  <button
                    onClick={
                      generateCookAI
                    }
                    className="flex-1 bg-[#f2f2f2] py-3 rounded-2xl"
                  >
                    换一个
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-500 mb-6">
                  让 AI 从你的菜单里帮你决定今晚做什么。
                </p>

                <button
                  onClick={
                    generateCookAI
                  }
                  disabled={
                    myMenu.length === 0
                  }
                  className="w-full bg-black text-white py-4 rounded-2xl disabled:opacity-30"
                >
                  {cookLoading
                    ? "AI 正在思考..."
                    : "帮我决定今晚做什么"}
                </button>
              </>
            )}
          </div>

          {/* 我的菜 */}
          <div className="bg-white rounded-[32px] p-8 shadow-sm">
            <p className="text-sm text-gray-400 mb-5">
              我的菜
            </p>

            <div className="flex gap-3 mb-6">
              <input
                value={newDish}
                onChange={(e) =>
                  setNewDish(
                    e.target.value
                  )
                }
                placeholder="输入一道你会做的菜"
                className="flex-1 bg-[#f5f5f7] rounded-2xl px-5 py-4 outline-none"
              />

              <button
                onClick={addDish}
                className="bg-black text-white px-5 rounded-2xl"
              >
                添加
              </button>
            </div>

            <div className="space-y-3">
              {myMenu.map((dish) => (
                <div
                  key={dish}
                  className="bg-[#f5f5f7] rounded-2xl px-5 py-4 flex justify-between items-center"
                >
                  <span>{dish}</span>

                  <button
                    onClick={() =>
                      deleteDish(dish)
                    }
                    className="text-gray-400"
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 灵感 */}
      {page === "discover" && (
        <div className="max-w-xl mx-auto px-6 mt-10 space-y-5">
          {inspirations.map(
            (item, index) => (
              <button
                key={index}
                onClick={() => {
                  setMood(item.title);

                  setPage("today");
                }}
                className="w-full text-left bg-white rounded-[32px] p-8 shadow-sm transition-all hover:scale-[1.01]"
              >
                <h2 className="text-3xl font-semibold leading-tight">
                  {item.title}
                </h2>

                <p className="text-gray-500 mt-5 leading-8">
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
          <div className="bg-white/80 backdrop-blur-xl border border-white/50 rounded-[28px] shadow-lg flex justify-around py-4">
            <button
              onClick={() =>
                setPage("today")
              }
              className={`text-sm ${
                page === "today"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              今天吃啥
            </button>

            <button
              onClick={() =>
                setPage("recent")
              }
              className={`text-sm ${
                page === "recent"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              最近
            </button>

            <button
              onClick={() =>
                setPage("menu")
              }
              className={`text-sm ${
                page === "menu"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              我的菜单
            </button>

            <button
              onClick={() =>
                setPage("discover")
              }
              className={`text-sm ${
                page === "discover"
                  ? "text-black"
                  : "text-gray-400"
              }`}
            >
              灵感
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}