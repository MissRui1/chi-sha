"use client";

import {
  useState,
  useEffect,
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { compressImage } from "@/lib/image";
import {
  curatedDishNames,
  normalizeFoodName,
} from "@/lib/dish-database";
import {
  readMealPhoto,
  saveMealPhoto,
} from "@/lib/photo-store";
import {
  exportMealWall,
  shareMealWall,
} from "@/lib/share";
import {
  clearStoredAccount,
  getOrCreateUserId,
  getStoredAccount,
  getUserStorageKey,
  normalizeAccountName,
  setStoredAccount,
  type StoredAccount,
} from "@/lib/user";

type MemoryItem = {
  userId: string;
  mealTime: string;
  mood: string;
  style: string;
  food: string;
  time: string;
  timezone?: string;
  timeUnknown?: boolean;
  type: "like" | "dislike";
  imageId?: string;
  imageUrl?: string;
};

type IdentifyResult = {
  kind: "dish" | "ingredient" | "non_food";
  isDish: boolean;
  dish: string;
  suggestion: string;
  ingredients: string[];
  cookableDishes: CookResult[];
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

type SyncRecord = {
  memory: unknown[];
  myMenu: string[];
  updatedAt: string;
};

type SpeechRecognitionResultEvent = Event & {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult:
    | ((event: SpeechRecognitionResultEvent) => void)
    | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
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

const fateFallbackFoods = curatedDishNames;

const pickRandom = <T,>(items: T[]) =>
  items[Math.floor(Math.random() * items.length)];

const uniq = (items: string[]) =>
  items
    .map((item) => item.trim())
    .filter(
      (item, index, arr) =>
        item && arr.indexOf(item) === index
    );

const normalizeDishName = normalizeFoodName;

const mergeMemoryRecords = (
  current: MemoryItem[],
  incoming: MemoryItem[],
  fallbackUserId: string
) => {
  const merged = [...current, ...incoming].map((item) => ({
    ...item,
    userId: item.userId || fallbackUserId,
  }));
  const seen = new Set<string>();

  return merged.filter((item) => {
    const key = `${item.type}:${item.food}:${item.time}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const parseSyncMemory = (
  items: unknown[],
  fallbackUserId: string
) =>
  items
    .map((item) =>
      typeof item === "string" ||
      (typeof item === "object" && item !== null)
        ? parseMemoryRecord(
            item as string | Partial<MemoryItem>,
            fallbackUserId
          )
        : null
    )
    .filter((item): item is MemoryItem => Boolean(item?.food));

const normalizeIdentifyResult = (
  value: unknown
): IdentifyResult => {
  const raw = (value ?? {}) as Partial<IdentifyResult>;
  const ingredients = Array.isArray(raw.ingredients)
    ? uniq(
        raw.ingredients.filter(
          (item): item is string =>
            typeof item === "string"
        )
      ).slice(0, 8)
    : [];
  const cookableDishes = Array.isArray(raw.cookableDishes)
    ? raw.cookableDishes
        .filter(
          (item): item is CookResult =>
            Boolean(
              item &&
                typeof item.dish === "string" &&
                Array.isArray(item.ingredients) &&
                Array.isArray(item.steps)
            )
        )
        .slice(0, 3)
    : [];
  const kind =
    raw.kind === "dish" ||
    raw.kind === "ingredient" ||
    raw.kind === "non_food"
      ? raw.kind
      : ingredients.length > 0
        ? "ingredient"
        : "non_food";

  return {
    kind,
    isDish: kind === "dish",
    dish:
      typeof raw.dish === "string" && raw.dish.trim()
        ? raw.dish.trim()
        : kind === "ingredient"
          ? "识别到食材"
          : "未识别食材",
    suggestion:
      typeof raw.suggestion === "string" &&
      raw.suggestion.trim()
        ? raw.suggestion.trim()
        : kind === "ingredient"
          ? "可以根据这些食材生成一道顺手的家常菜。"
          : "这张图里的食材不够明确，可以换一张更清晰的照片。",
    ingredients,
    cookableDishes,
  };
};

const selectWeightedFood = ({
  recentFoods,
  menuFoods,
  blockedFoods,
}: {
  recentFoods: string[];
  menuFoods: string[];
  blockedFoods: string[];
}) => {
  const blocked = new Set(blockedFoods.map(normalizeDishName));
  const recentUnique = uniq(recentFoods).filter(
    (food) => !blocked.has(normalizeDishName(food))
  );
  const menuUnique = uniq(menuFoods).filter(
    (food) => !blocked.has(normalizeDishName(food))
  );
  const fallbackUnique = uniq(fateFallbackFoods).filter(
    (food) => !blocked.has(normalizeDishName(food))
  );
  const menuWeight = Math.min(
    0.68,
    0.16 + menuUnique.length * 0.045
  );
  const recentWeight = Math.min(
    0.22,
    0.08 + recentUnique.length * 0.015
  );
  const sources = [
    {
      items: menuUnique,
      label: "从你的菜单抽中",
      weight: menuUnique.length ? menuWeight : 0,
    },
    {
      items: recentUnique,
      label: "从你的饮食日记抽中",
      weight: recentUnique.length ? recentWeight : 0,
    },
    {
      items: fallbackUnique,
      label: "从扩展菜品池抽中",
      weight: fallbackUnique.length ? 1 : 0,
    },
  ];
  const totalWeight = sources.reduce(
    (sum, source) => sum + source.weight,
    0
  );
  let cursor = Math.random() * totalWeight;
  const source =
    sources.find((item) => {
      cursor -= item.weight;
      return cursor <= 0;
    }) ?? sources[sources.length - 1];
  const picked = pickRandom(source.items) ?? pickRandom(fallbackUnique);

  return {
    food: picked,
    source: source.label,
  };
};

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

const formatDateTime = (
  value: string,
  options: {
    timezone?: string;
    timeUnknown?: boolean;
  } = {}
) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "时间未知";
  }

  const formatted = new Intl.DateTimeFormat("zh-CN", {
    timeZone: options.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);

  return options.timeUnknown
    ? `${formatted}（旧记录时间未知）`
    : formatted;
};

const shortUserId = (value: string) =>
  value ? value.slice(0, 8) : "未生成";

const getCurrentTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  "Asia/Shanghai";

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
  item: string | Partial<MemoryItem>,
  fallbackUserId: string
): MemoryItem => {
  if (typeof item === "string") {
    const parts = item.split(" · ");
    const migratedAt = new Date().toISOString();

    return {
      userId: fallbackUserId,
      mealTime: parts[0] || "",
      mood: parts[1] || "",
      style: parts[2] || "",
      food: parts[3] || item,
      time: migratedAt,
      timezone: getCurrentTimezone(),
      timeUnknown: true,
      type: "like",
    };
  }

  const hasTime = Boolean(item.time);

  return {
    userId: fallbackUserId,
    mealTime: item.mealTime || "",
    mood: item.mood || "",
    style: item.style || "",
    food: item.food || "",
    time: item.time || new Date().toISOString(),
    timezone: item.timezone || getCurrentTimezone(),
    timeUnknown: item.timeUnknown || !hasTime,
    type:
      item.type === "dislike"
        ? "dislike"
        : "like",
    imageId: item.imageId,
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

const safeSetLocalStorage = (
  key: string,
  value: string
) => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.log("Local storage write failed:", error);
    return false;
  }
};

const archiveLegacyStorageKey = (
  key: string,
  value: string
) => {
  const archiveKey = `${key}:legacy:${Date.now()}`;

  if (safeSetLocalStorage(archiveKey, value)) {
    localStorage.removeItem(key);
  }
};

const readMemory = (targetUserId?: string): MemoryItem[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const userId = targetUserId || getOrCreateUserId();
    const userKey = getUserStorageKey(userId, "memory");
    const savedUserMemory = localStorage.getItem(userKey);
    const savedLegacyMemory = localStorage.getItem("memory");
    const savedMemory = savedUserMemory ?? savedLegacyMemory;

    if (!savedMemory) {
      return [];
    }

    const parsed = JSON.parse(savedMemory);
    const records = Array.isArray(parsed)
      ? parsed.map((item) =>
          parseMemoryRecord(item, userId)
        )
      : [];

    const wroteUserMemory = safeSetLocalStorage(
      userKey,
      JSON.stringify(records)
    );

    if (
      wroteUserMemory &&
      !savedUserMemory &&
      savedLegacyMemory
    ) {
      archiveLegacyStorageKey("memory", savedLegacyMemory);
    }

    return records;
  } catch {
    return [];
  }
};

const readMenu = (
  targetUserId?: string,
  options: {
    fallbackToDefault?: boolean;
    migrateLegacy?: boolean;
  } = {}
): string[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const {
      fallbackToDefault = true,
      migrateLegacy = true,
    } = options;
    const userId = targetUserId || getOrCreateUserId();
    const userKey = getUserStorageKey(userId, "myMenu");
    const savedUserMenu = localStorage.getItem(userKey);
    const savedLegacyMenu = migrateLegacy
      ? localStorage.getItem("myMenu")
      : null;
    const savedMenu = savedUserMenu ?? savedLegacyMenu;

    if (!savedMenu) {
      return fallbackToDefault ? defaultMenuDishes : [];
    }

    const parsed = JSON.parse(savedMenu);

    const menu = Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string =>
            typeof item === "string"
        )
      : [];

    const wroteUserMenu = safeSetLocalStorage(
      userKey,
      JSON.stringify(uniq(menu))
    );

    if (
      wroteUserMenu &&
      !savedUserMenu &&
      savedLegacyMenu
    ) {
      archiveLegacyStorageKey("myMenu", savedLegacyMenu);
    }

    return menu;
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

const getMemoryImageUrl = (
  item: MemoryItem,
  photoUrls: Record<string, string>
) =>
  item.imageUrl ||
  (item.imageId ? photoUrls[item.imageId] : undefined);

const MealCard = ({
  item,
  photoUrls,
}: {
  item: MemoryItem;
  photoUrls: Record<string, string>;
}) => {
  const imageUrl = getMemoryImageUrl(item, photoUrls);

  return (
    <div className="mb-3 break-inside-avoid surface-card overflow-hidden">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={item.food}
          className="w-full object-cover"
        />
      )}

      <div className="p-4">
        <h4 className="font-semibold leading-tight">
          {item.food}
        </h4>
        <p className="text-xs muted-text mt-2">
          {formatDateTime(item.time, {
            timezone: item.timezone,
            timeUnknown: item.timeUnknown,
          })}
        </p>
      </div>
    </div>
  );
};

export default function Home() {
  const [page, setPage] = useState("today");

  const [mealTime, setMealTime] =
    useState(inferMealTime);

  const [mood, setMood] =
    useState<string[]>(["奖励自己"]);

  const [style, setStyle] =
    useState<string[]>(["中餐"]);

  const [userId, setUserId] = useState("");

  const [accountSession, setAccountSession] =
    useState<StoredAccount | null>(null);

  const [loginAccount, setLoginAccount] =
    useState("");

  const [loginPasscode, setLoginPasscode] =
    useState("");

  const [syncLoading, setSyncLoading] =
    useState(false);

  const [lastSyncedAt, setLastSyncedAt] =
    useState("");

  const [food, setFood] = useState("");

  const [reason, setReason] =
    useState("");

  const [acceptedFood, setAcceptedFood] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [memory, setMemory] =
    useState<MemoryItem[]>([]);

  const [photoUrls, setPhotoUrls] = useState<
    Record<string, string>
  >({});

  const [missingPhotoIds, setMissingPhotoIds] =
    useState<string[]>([]);

  const [insights, setInsights] =
    useState<string[]>(() => buildInsights([]));

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

  const [candidateFoods, setCandidateFoods] =
    useState<string[]>([]);

  const [manualDiaryFood, setManualDiaryFood] =
    useState("");

  const [manualDiaryNote, setManualDiaryNote] =
    useState("");

  const [manualInspiration, setManualInspiration] =
    useState("");

  const [voiceTarget, setVoiceTarget] =
    useState<"diary" | "inspiration" | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedAccount = getStoredAccount();
      const uid = savedAccount?.userId || getOrCreateUserId();
      const savedMemory = readMemory(uid);
      const savedMenu = readMenu(uid);

      setAccountSession(savedAccount);
      setLoginAccount(savedAccount?.account ?? "");
      setUserId(uid);
      setPhotoUrls({});
      setMissingPhotoIds([]);
      setMemory(savedMemory);
      setInsights(buildInsights(savedMemory));
      setMyMenu(savedMenu);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const knownMissing = new Set(missingPhotoIds);
    const missingIds = memory
      .map((item) => item.imageId)
      .filter(
        (id): id is string => Boolean(id)
      )
      .filter(
        (id) => !photoUrls[id] && !knownMissing.has(id)
      );

    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      missingIds.map(async (id) => {
        const dataUrl = await readMealPhoto(id, userId);
        return [id, dataUrl] as const;
      })
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      setPhotoUrls((prev) => {
        const next = { ...prev };
        const notFound: string[] = [];

        entries.forEach(([id, dataUrl]) => {
          if (dataUrl) {
            next[id] = dataUrl;
          } else {
            notFound.push(id);
          }
        });

        if (notFound.length > 0) {
          setMissingPhotoIds((prevMissing) =>
            uniq([...prevMissing, ...notFound])
          );
        }

        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [memory, missingPhotoIds, photoUrls, userId]);

  const toggleValue = (
    value: string,
    setter: Dispatch<
      SetStateAction<string[]>
    >
  ) => {
    setter((prev) =>
      prev.includes(value)
        ? prev.filter((item) => item !== value)
        : [...prev, value].slice(-4)
    );
  };

  const ensureUser = useCallback(() => {
    const uid = userId || getOrCreateUserId();

    if (!userId && uid) {
      setUserId(uid);
    }

    return uid;
  }, [userId]);

  const syncAccountData = useCallback(
    async ({
      session = accountSession,
      nextMemory = memory,
      nextMenu = myMenu,
      mode,
    }: {
      session?: StoredAccount | null;
      nextMemory?: MemoryItem[];
      nextMenu?: string[];
      mode: "pull" | "push" | "merge";
    }) => {
      if (!session) {
        return null;
      }

      const shouldPullFirst =
        mode === "pull" || mode === "merge";
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account: session.account,
          passcode: session.passcode,
          ...(shouldPullFirst
            ? {}
            : {
                memory: nextMemory,
                myMenu: nextMenu,
                updatedAt: new Date().toISOString(),
              }),
        }),
      });

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(errorData?.error ?? "sync unavailable");
      }

      const data = (await response.json()) as {
        ok: boolean;
        record?: SyncRecord;
      };

      if (!data.ok || !data.record) {
        throw new Error("sync failed");
      }

      const remoteMemory = parseSyncMemory(
        data.record.memory ?? [],
        session.userId
      );
      const remoteMenu = uniq(data.record.myMenu ?? []);

      if (mode === "pull") {
        safeSetLocalStorage(
          getUserStorageKey(session.userId, "memory"),
          JSON.stringify(remoteMemory)
        );
        safeSetLocalStorage(
          getUserStorageKey(session.userId, "myMenu"),
          JSON.stringify(remoteMenu)
        );

        setMemory(remoteMemory);
        setInsights(buildInsights(remoteMemory));
        setMyMenu(remoteMenu.length > 0 ? remoteMenu : defaultMenuDishes);
      } else if (mode === "merge") {
        const mergedMemory = mergeMemoryRecords(
          nextMemory,
          remoteMemory,
          session.userId
        );
        const mergedMenu = uniq([...nextMenu, ...remoteMenu]);

        safeSetLocalStorage(
          getUserStorageKey(session.userId, "memory"),
          JSON.stringify(mergedMemory)
        );
        safeSetLocalStorage(
          getUserStorageKey(session.userId, "myMenu"),
          JSON.stringify(mergedMenu)
        );

        setMemory(mergedMemory);
        setInsights(buildInsights(mergedMemory));
        setMyMenu(mergedMenu.length > 0 ? mergedMenu : defaultMenuDishes);

        await fetch("/api/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account: session.account,
            passcode: session.passcode,
            memory: mergedMemory,
            myMenu: mergedMenu,
            updatedAt: new Date().toISOString(),
          }),
        });
      }

      setLastSyncedAt(new Date().toISOString());
      return data.record;
    },
    [accountSession, memory, myMenu]
  );

  const saveAccountData = useCallback(
    (nextMemory: MemoryItem[], nextMenu: string[]) => {
      const session = accountSession;

      if (!session) {
        return;
      }

      void syncAccountData({
        session,
        nextMemory,
        nextMenu,
        mode: "push",
      }).catch((error) => {
        console.log("Background sync failed:", error);
      });
    },
    [accountSession, syncAccountData]
  );

  const startVoiceInput = (
    target: "diary" | "inspiration"
  ) => {
    const speechWindow = window as SpeechWindow;
    const Recognition =
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      toast.error("当前浏览器不支持语音输入");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setVoiceTarget(target);

    recognition.onresult = (event) => {
      const text =
        event.results[0]?.[0]?.transcript?.trim() ?? "";

      if (!text) {
        return;
      }

      if (target === "diary") {
        setManualDiaryFood(text);
      } else {
        setManualInspiration(text);
      }
    };
    recognition.onerror = () => {
      toast.error("语音识别失败，请再试一次");
      setVoiceTarget(null);
    };
    recognition.onend = () => {
      setVoiceTarget(null);
    };
    recognition.start();
  };

  // 灵感 AI
  const generateInspirations =
    useCallback(async () => {
      const uid = ensureUser();

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
                userId: uid,
                mood: mood.join("、"),
                mealTime,
                memory: formatMemoryText(memory),
                nonce: `${Date.now()}-${Math.random()}`,
              }),
            }
          );

        if (!response.ok) {
          throw new Error("inspiration api failed");
        }

        const data =
          await response.json();

        const parsed =
          JSON.parse(cleanJson(data.result));

        setInspirations((prev) => {
          const manual = prev.filter((item) =>
            item.desc.includes("自己想到")
          );

          return [...manual.slice(0, 3), ...parsed].slice(0, 12);
        });
      } catch (error) {
        console.log(error);
      }
    }, [ensureUser, mealTime, memory, mood]);

  // 保存 memory
  const saveMemory = (
    newMemory: MemoryItem[]
  ) => {
    const uid = ensureUser();
    const normalized = newMemory.map((item) => ({
      ...item,
      userId: item.userId || uid,
    }));

    const saved = safeSetLocalStorage(
      getUserStorageKey(uid, "memory"),
      JSON.stringify(normalized)
    );

    if (!saved) {
      toast.error("本地空间不足，记录没有保存成功");
      return false;
    }

    setMemory(normalized);

    setInsights(buildInsights(normalized));
    saveAccountData(normalized, myMenu);
    return true;
  };

  // 保存菜单
  const saveMenu = (
    newMenu: string[]
  ) => {
    const uid = ensureUser();
    const normalized = uniq(newMenu);

    const saved = safeSetLocalStorage(
      getUserStorageKey(uid, "myMenu"),
      JSON.stringify(normalized)
    );

    if (!saved) {
      toast.error("本地空间不足，菜单没有保存成功");
      return false;
    }

    setMyMenu(normalized);
    saveAccountData(memory, normalized);
    return true;
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

    if (saveMenu(updated)) {
      setNewDish("");
      toast.success("已加入我的菜单");
    }
  };

  // 删除菜
  const deleteDish = (
    dish: string
  ) => {
    const updated = myMenu.filter(
      (item) => item !== dish
    );

    if (saveMenu(updated)) {
      toast.success("已从菜单删除");
    }
  };

  const loginAndSync = async () => {
    const account = normalizeAccountName(loginAccount);

    if (!account || loginPasscode.length < 4) {
      toast.error("请输入账号和至少 4 位同步口令");
      return;
    }

    const session = setStoredAccount(account, loginPasscode);

    if (!session) {
      toast.error("账号信息不完整");
      return;
    }

    setSyncLoading(true);

    try {
      const currentUserId = userId || getOrCreateUserId();
      const currentMemory = memory;
      const currentMenu = readMenu(currentUserId, {
        fallbackToDefault: false,
      });
      setAccountSession(session);
      setUserId(session.userId);
      const accountMemory = readMemory(session.userId);
      const accountMenu = readMenu(session.userId, {
        fallbackToDefault: false,
        migrateLegacy: false,
      });
      const localMemory = mergeMemoryRecords(
        currentMemory,
        accountMemory,
        session.userId
      );
      const localMenu = uniq([
        ...currentMenu,
        ...accountMenu,
      ]);

      setMemory(localMemory);
      setInsights(buildInsights(localMemory));
      setMyMenu(localMenu);
      setPhotoUrls({});
      setMissingPhotoIds([]);

      await syncAccountData({
        session,
        nextMemory: localMemory,
        nextMenu: localMenu,
        mode: "merge",
      });
      toast.success("账号已登录，数据已同步");
    } catch (error) {
      console.log(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "云同步未完成，请检查 Vercel KV 配置"
      );
    } finally {
      setLoginPasscode("");
      setSyncLoading(false);
    }
  };

  const logoutAccount = () => {
    clearStoredAccount();
    setAccountSession(null);
    setLoginPasscode("");
    const uid = getOrCreateUserId();
    const savedMemory = readMemory(uid);
    const savedMenu = readMenu(uid);

    setUserId(uid);
    setPhotoUrls({});
    setMissingPhotoIds([]);
    setMemory(savedMemory);
    setInsights(buildInsights(savedMemory));
    setMyMenu(savedMenu);
    toast.success("已退出账号，当前使用本地记录");
  };

  const manualSync = async () => {
    if (!accountSession) {
      toast.error("先登录账号再同步");
      return;
    }

    setSyncLoading(true);

    try {
      await syncAccountData({
        session: accountSession,
        nextMemory: memory,
        nextMenu: myMenu,
        mode: "merge",
      });
      toast.success("同步完成");
    } catch (error) {
      console.log(error);
      toast.error(
        error instanceof Error
          ? error.message
          : "同步失败，请检查云同步配置"
      );
    } finally {
      setSyncLoading(false);
    }
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
      const blockedFoods = [
        ...candidateFoods,
        ...(food ? [food] : []),
      ];
      let picked = selectWeightedFood({
        recentFoods: savedFoods,
        menuFoods,
        blockedFoods,
      });

      if (!picked.food) {
        picked = selectWeightedFood({
          recentFoods: savedFoods,
          menuFoods,
          blockedFoods: [],
        });
      }

      setFateResult({
        food: picked.food,
        source: picked.source,
        reason: `${picked.source}：${picked.food}。别再和选择题拉扯了，今天就让它落地。`,
      });
      setCandidateFoods((prev) =>
        uniq([...prev, picked.food]).slice(-60)
      );
      setFateLoading(false);
    }, 1300);
  };

  const acceptFateResult = () => {
    if (!fateResult) return;

    setFood(fateResult.food);
    setReason(fateResult.reason);
    setAcceptedFood("");
    setPage("today");
  };

  // 首页 AI
  const generateFood = async (
    retry = false,
    currentMemory?: MemoryItem[]
  ) => {
    const uid = ensureUser();
    setLoading(true);
    setAcceptedFood("");

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
            userId: uid,
            mood: mood.join("、"),
            style: style.join("、"),
            retry,
            previousFood: food,
            ...getClientContext(),
            history: memorySource
              .filter((item) => item.type === "like")
              .map((item) => item.food)
              .concat(candidateFoods),
            memory: formatMemoryText(memorySource),
          }),
        }
      );

      if (!response.ok) {
        throw new Error("recommend api failed");
      }

      const data =
        await response.json();

      const parsed =
        JSON.parse(cleanJson(data.result));

      setFood(parsed.food);

      setReason(parsed.reason);
      setCandidateFoods((prev) =>
        uniq([...prev, parsed.food]).slice(-60)
      );
    } catch (error) {
      console.log(error);
      toast.error("AI 刚刚有点忙，请再试一次");
    } finally {
      setLoading(false);
    }
  };

  // 做饭 AI
  const generateCookAI =
    async (availableIngredients?: string[]) => {
      const uid = ensureUser();
      const isIngredientMode =
        Array.isArray(availableIngredients) &&
        availableIngredients.length > 0;

      if (myMenu.length === 0 && !isIngredientMode) {
        toast.error("先添加几道你会做的菜");
        return;
      }

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
              userId: uid,
              mood: mood.join("、"),
              menu: isIngredientMode ? [] : myMenu,
              history: cookHistory,
              availableIngredients,
              ...getClientContext(),
            }),
          });

        if (!response.ok) {
          throw new Error("cook api failed");
        }

        const data =
          await response.json();

        const parsed =
          JSON.parse(cleanJson(data.result));

        setCookResult(parsed);
        setPage("menu");

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
  const acceptFood = (photo?: {
    imageId?: string;
    imageUrl?: string;
  }) => {
    const uid = ensureUser();
    const targetFood = acceptedFood || food;

    if (!targetFood) {
      toast.error("先选一道吃的");
      return false;
    }

    const existingIndex = acceptedFood
      ? memory.findLastIndex(
          (item) =>
            item.type === "like" &&
            item.food === acceptedFood
        )
      : -1;

    if (existingIndex >= 0 && photo?.imageId) {
      const updated = memory.map((item, index) =>
        index === existingIndex
          ? {
              ...item,
              imageId: photo.imageId,
              imageUrl: photo.imageUrl,
            }
          : item
      );

      if (saveMemory(updated)) {
        toast.success("照片已补到饮食日记");
      }

      return true;
    }

    const updated: MemoryItem[] = [
      ...memory,
      {
        mealTime,
        userId: uid,
        mood: mood.join("、"),
        style: style.join("、"),
        food: targetFood,
        time: new Date().toISOString(),
        timezone: getCurrentTimezone(),
        timeUnknown: false,
        type: "like",
        imageId: photo?.imageId,
        imageUrl: photo?.imageUrl,
      },
    ];

    if (!saveMemory(updated)) {
      return false;
    }

    toast.success("今天终于不用纠结了");
    setCandidateFoods([]);
    setFateResult(null);
    setAcceptedFood(targetFood);
    return true;
  };

  const acceptFoodWithPhoto = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      const imageUrl = await compressImage(file);
      const imageId = await saveMealPhoto(
        imageUrl,
        ensureUser()
      );

      if (imageId) {
        setPhotoUrls((prev) => ({
          ...prev,
          [imageId]: imageUrl,
        }));
        acceptFood({ imageId });
      } else {
        acceptFood();
        toast.error("当前浏览器无法保存照片，已保存文字记录");
      }
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
        userId: ensureUser(),
        mood: mood.join("、"),
        style: style.join("、"),
        food,
        time: new Date().toISOString(),
        timezone: getCurrentTimezone(),
        timeUnknown: false,
        type: "dislike",
      },
    ];

    if (saveMemory(updated)) {
      generateFood(true, updated);
    }
  };

  const addManualDiary = () => {
    const foodName = manualDiaryFood.trim();

    if (!foodName) {
      toast.error("先写下这顿吃了什么");
      return;
    }

    const uid = ensureUser();
    const updated: MemoryItem[] = [
      ...memory,
      {
        mealTime,
        userId: uid,
        mood: manualDiaryNote.trim() || mood.join("、"),
        style: "自主记录",
        food: foodName,
        time: new Date().toISOString(),
        timezone: getCurrentTimezone(),
        timeUnknown: false,
        type: "like",
      },
    ];

    if (saveMemory(updated)) {
      setManualDiaryFood("");
      setManualDiaryNote("");
      toast.success("已加入饮食日记");
    }
  };

  const exportRecentMeals = async () => {
    setShareLoading(true);

    try {
      const groups = await Promise.all(
        groupMeals(memory).map(async (group) => ({
          title: group.title,
          items: await Promise.all(
            group.items.map(async (item) => {
              const storedImage =
                getMemoryImageUrl(item, photoUrls) ??
                (await readMealPhoto(item.imageId, userId));

              return {
                food: item.food,
                time: item.time,
                timezone: item.timezone,
                timeUnknown: item.timeUnknown,
                imageUrl: storedImage,
              };
            })
          ),
        }))
      );

      const blob = await exportMealWall(groups);

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
    setIdentifyResult(null);

    try {
      const imageDataUrl = await compressImage(file);
      const response = await fetch("/api/identify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageDataUrl }),
      });
      if (!response.ok) {
        throw new Error("identify api failed");
      }
      const result = normalizeIdentifyResult(
        await response.json()
      );

      setIdentifyResult(result);
      if (result.kind === "dish") {
        toast.success("识别到可用食材");
      } else if (result.kind === "ingredient") {
        toast.success("识别到食材");
      } else {
        toast.error("这张图里的食材不够明确");
      }
    } catch (error) {
      console.log(error);
      toast.error("识材失败，请换张清晰照片");
    } finally {
      setIdentifyLoading(false);
    }
  };

  const addIdentifiedDishToMenu = () => {
    if (identifyResult?.kind !== "dish") return;

    if (myMenu.includes(identifyResult.dish)) {
      toast.error("这道菜已经在菜单里了");
      return;
    }

    if (saveMenu([...myMenu, identifyResult.dish])) {
      toast.success("已加入我的菜单");
    }
  };

  const cookWithIdentifiedIngredients = () => {
    if (
      !identifyResult ||
      identifyResult.kind === "non_food"
    ) {
      return;
    }

    if (identifyResult.ingredients.length === 0) {
      toast.error("没有识别到可用食材");
      return;
    }

    void generateCookAI(identifyResult.ingredients);
  };

  const addManualInspiration = () => {
    const text = manualInspiration.trim();

    if (!text) {
      toast.error("先写一点你想到的灵感");
      return;
    }

    setInspirations((prev) => [
      {
        title: text,
        desc: "这是你自己想到的方向，可以直接带回今天的选择里。",
      },
      ...prev,
    ]);
    setManualInspiration("");
    toast.success("灵感已记下");
  };

  const addRandomInspiration = () => {
    const prompts = [
      {
        title: "冰箱里先用掉一样东西",
        desc: "从最容易坏的食材开始想，今天少浪费一点。",
      },
      {
        title: "做一顿 15 分钟能结束的饭",
        desc: "不追求复杂，热乎、能吃、少洗锅就很好。",
      },
      {
        title: "选一个小时候常吃的味道",
        desc: "让今天的选择更像生活，不像任务。",
      },
      {
        title: "今天吃点有汤水的",
        desc: "给身体一点温度，也让这一顿慢下来。",
      },
      {
        title: "找一个酸甜口",
        desc: "没食欲的时候，酸甜味通常更容易打开胃口。",
      },
      {
        title: "把主食换一种形态",
        desc: "米饭、面、粉、粥之间换一下，选择会轻很多。",
      },
    ];
    const picked = pickRandom(prompts);

    setInspirations((prev) => [picked, ...prev].slice(0, 12));
  };

  const pageTitle =
    page === "menu"
      ? "做啥？"
      : page === "discover"
        ? "灵感"
        : page === "recent"
          ? "饮食日记"
          : "吃啥？";

  const pageSubtitle =
    page === "menu"
      ? "今天在家就做这个。"
      : page === "discover"
        ? "换个角度，给今天一点吃饭灵感。"
        : page === "recent"
          ? "最近认真吃过的每一顿。"
          : "今天终于不用纠结了。";

  return (
    <main className="app-shell min-h-screen pb-40">
      {/* 顶部 */}
      <div className="max-w-xl mx-auto px-6 pt-12">
        <h1 className="text-5xl font-semibold tracking-tight">
          {pageTitle}
        </h1>

        <p className="muted-text mt-3 leading-7">
          {pageSubtitle}
        </p>

        <p className="text-xs text-gray-400 mt-3">
          {accountSession
            ? `账号：${accountSession.account}`
            : `本地用户 ID：${shortUserId(userId)}`}
        </p>

        <div className="sync-panel mt-5 p-4">
          {accountSession ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  已开启账号同步
                </p>
                <p className="text-xs muted-text mt-1">
                  {lastSyncedAt
                    ? `最近同步：${formatDateTime(lastSyncedAt)}`
                    : "登录后会同步菜单和饮食日记"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void manualSync()}
                  disabled={syncLoading}
                  className="secondary-button px-4 py-2 text-sm disabled:opacity-40"
                >
                  {syncLoading ? "同步中" : "同步"}
                </button>
                <button
                  onClick={logoutAccount}
                  className="secondary-button px-4 py-2 text-sm"
                >
                  退出
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input
                value={loginAccount}
                onChange={(event) =>
                  setLoginAccount(event.target.value)
                }
                placeholder="账号名"
                className="app-input px-4 py-3 text-sm"
              />
              <input
                value={loginPasscode}
                onChange={(event) =>
                  setLoginPasscode(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void loginAndSync();
                  }
                }}
                placeholder="同步口令"
                type="password"
                className="app-input px-4 py-3 text-sm"
              />
              <button
                onClick={() => void loginAndSync()}
                disabled={syncLoading}
                className="primary-button px-5 py-3 text-sm disabled:opacity-40"
              >
                {syncLoading ? "同步中" : "登录"}
              </button>
            </div>
          )}
        </div>
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

              <div className="segmented-control">
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
                    aria-pressed={mealTime === item}
                    className={`segmented-item ${
                      mealTime === item
                        ? "segmented-item-active"
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

              <div className="flex flex-wrap gap-2">
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
                    aria-pressed={mood.includes(item)}
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

              <div className="flex flex-wrap gap-2">
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
                    aria-pressed={style.includes(item)}
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
                {!acceptedFood ? (
                  <button
                    onClick={() => acceptFood()}
                    className="primary-button flex-1 py-3"
                  >
                    就这个了
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setFood("");
                      setReason("");
                      setAcceptedFood("");
                    }}
                    className="primary-button flex-1 py-3"
                  >
                    完成
                  </button>
                )}

                <button
                  onClick={declineFood}
                  disabled={Boolean(acceptedFood)}
                  className="secondary-button flex-1 py-3"
                >
                  换一换
                </button>
              </div>

              <label className="secondary-button mt-4 block text-center py-3 cursor-pointer">
                {acceptedFood ? "补传这顿照片" : "带照片确认"}
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

          <div className="surface-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">自己记一顿</h3>
                <p className="text-sm muted-text mt-1">
                  不用等推荐，想到什么就直接写进日记。
                </p>
              </div>
              <button
                onClick={() => startVoiceInput("diary")}
                className="secondary-button px-4 py-2 text-sm"
              >
                {voiceTarget === "diary" ? "听你说" : "语音"}
              </button>
            </div>
            <input
              value={manualDiaryFood}
              onChange={(event) =>
                setManualDiaryFood(event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  addManualDiary();
                }
              }}
              placeholder="比如：番茄炒蛋、牛肉面、今天自己煮了粥"
              className="app-input w-full px-4 py-3"
            />
            <div className="flex gap-3">
              <input
                value={manualDiaryNote}
                onChange={(event) =>
                  setManualDiaryNote(event.target.value)
                }
                placeholder="状态备注，可不填"
                className="app-input min-w-0 flex-1 px-4 py-3"
              />
              <button
                onClick={addManualDiary}
                className="primary-button px-5 py-3"
              >
                记录
              </button>
            </div>
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
                    <MealCard
                      key={`${item.food}-${item.time}`}
                      item={item}
                      photoUrls={photoUrls}
                    />
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
                    onClick={() =>
                      void generateCookAI()
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
                  onClick={() =>
                    void generateCookAI()
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

                      if (saveMenu([...myMenu, dish])) {
                        toast.success("已加入我的菜单");
                      }
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
              拍照识材
            </h2>
            <p className="muted-text mt-5 leading-8">
              拍一下冰箱、案板或剩余食材，先识别能用的食材，再生成适合清库存的家常菜。
            </p>

            <label className="primary-button mt-6 block text-center py-4 cursor-pointer">
              拍照清理冰箱食材
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
                  食材盘点
                </p>
                <h3 className="text-2xl font-semibold">
                  {identifyResult.dish}
                </h3>
                <p className="muted-text mt-3 leading-7">
                  {identifyResult.suggestion}
                </p>

                {identifyResult.ingredients.length > 0 && (
                  <div className="mt-5">
                    <p className="text-sm text-gray-400 mb-3">
                      可用食材
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {identifyResult.ingredients.map(
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
                )}

                {identifyResult.cookableDishes.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <p className="text-sm text-gray-400">
                      可以顺手做
                    </p>
                    {identifyResult.cookableDishes.map(
                      (item) => (
                        <div
                          key={item.dish}
                          className="recipe-suggestion p-4"
                        >
                          <h4 className="font-semibold">
                            {item.dish}
                          </h4>
                          <p className="muted-text mt-2 leading-7">
                            {item.reason}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                )}

                {identifyResult.kind !==
                  "non_food" && (
                  <div className="grid grid-cols-1 gap-3 mt-5 sm:grid-cols-2">
                    {identifyResult.kind === "dish" && (
                      <button
                        onClick={
                          addIdentifiedDishToMenu
                        }
                        className="primary-button py-3"
                      >
                        加入菜单
                      </button>
                    )}
                    <button
                      onClick={cookWithIdentifiedIngredients}
                      className="secondary-button py-3"
                    >
                      按这些食材推荐
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
          <div className="inspiration-board p-6">
            <p className="text-sm text-gray-400 mb-3">
              今天先想一个方向
            </p>
            <textarea
              value={manualInspiration}
              onChange={(event) =>
                setManualInspiration(event.target.value)
              }
              placeholder="比如：想吃有汤水的、想把冰箱鸡蛋用掉、想吃一点酸甜口"
              className="app-input min-h-28 w-full resize-none px-4 py-3"
            />
            <div className="grid grid-cols-3 gap-3 mt-4">
              <button
                onClick={addManualInspiration}
                className="primary-button py-3"
              >
                记下
              </button>
              <button
                onClick={() => startVoiceInput("inspiration")}
                className="secondary-button py-3"
              >
                {voiceTarget === "inspiration" ? "听你说" : "语音"}
              </button>
              <button
                onClick={addRandomInspiration}
                className="secondary-button py-3"
              >
                翻一张
              </button>
            </div>
          </div>

          <button
            onClick={() =>
              void generateInspirations()
            }
            className="primary-button w-full py-4 text-lg"
          >
            AI 补满灵感墙
          </button>

          <div className="grid gap-4">
            {inspirations.map(
              (item, index) => (
                <button
                  key={`${item.title}-${index}`}
                  onClick={() => {
                    setMood((prev) =>
                      uniq([...prev, item.title]).slice(-4)
                    );
                    setPage("today");
                  }}
                  className="inspiration-card pressable w-full text-left p-6"
                >
                  <span className="inspiration-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2 className="text-2xl font-semibold leading-tight mt-4">
                    {item.title}
                  </h2>

                  <p className="muted-text mt-4 leading-8">
                    {item.desc}
                  </p>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* 底部导航 */}
      <div className="fixed bottom-0 left-0 w-full">
        <div className="bottom-nav-shell max-w-xl mx-auto px-3 sm:px-6">
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
              饮食日记
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
