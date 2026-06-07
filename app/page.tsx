"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { motion } from "framer-motion";
import {
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Dice5,
  Heart,
  Home as HomeIcon,
  LocateFixed,
  LogOut,
  List,
  Mic,
  Plus,
  RefreshCw,
  Share2,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { compressImage } from "@/lib/image";
import {
  curatedDishNames,
  normalizeFoodName,
} from "@/lib/dish-database";
import {
  cacheMealPhoto,
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

type InspirationItem = {
  title: string;
  desc: string;
};

type UserLocation = {
  source: "browser-geolocation" | "ip";
  provider: "amap";
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  province?: string;
  city?: string;
  district?: string;
  township?: string;
  adcode?: string;
  formattedAddress?: string;
  nearbyPois?: Array<{
    name: string;
    type?: string;
    address?: string;
    distance?: number;
    location?: string;
  }>;
};

type SyncRecord = {
  memory: unknown[];
  myMenu: string[];
  photos?: Record<string, string>;
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

const mealTimeOptions = [
  "早餐",
  "午餐",
  "晚餐",
  "夜宵",
  "奶茶",
];

const moodOptions = [
  { label: "奖励自己", emoji: "🎁" },
  { label: "摆烂", emoji: "🛋️" },
  { label: "减脂期", emoji: "🥗" },
  { label: "想吃热乎的", emoji: "♨️" },
  { label: "想吃凉快的", emoji: "🌿" },
  { label: "没食欲", emoji: "🫧" },
  { label: "emo", emoji: "🌧️" },
];

const styleOptions = [
  "中餐",
  "韩餐",
  "日料",
  "西餐",
  "快餐",
  "甜点",
  "随便",
];

const menuPhotoPool = [
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=700&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1547592180-85f173990554?w=700&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1544025162-d76694265947?w=700&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=700&q=80&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=700&q=80&auto=format&fit=crop",
];

const heroPhoto =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=900&q=80&auto=format&fit=crop";

const identifyPhoto =
  "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=700&q=80&auto=format&fit=crop";

const getGreeting = () => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 11) return "早上好";
  if (hour >= 11 && hour < 13) return "中午好";
  if (hour >= 13 && hour < 18) return "下午好";
  if (hour >= 18 && hour < 23) return "晚上好";

  return "夜深了";
};

const getMenuPhoto = (dish: string, index: number) =>
  menuPhotoPool[
    Math.abs(
      [...dish].reduce(
        (sum, char) => sum + char.charCodeAt(0),
        index
      )
    ) % menuPhotoPool.length
  ];

const randomInspirationPrompts: InspirationItem[] = [
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

const MAX_SYNC_PHOTOS = 24;
const MAX_SYNC_PHOTO_CHARS = 2_400_000;

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

const getLocationLabel = (location: UserLocation | null) => {
  if (!location) {
    return "未定位";
  }

  return (
    [
      location.city,
      location.district,
      location.township,
    ]
      .filter(Boolean)
      .join(" · ") ||
    location.formattedAddress ||
    "已定位"
  );
};

const formatLocationForPrompt = (
  location: UserLocation | null
) => {
  if (!location) {
    return undefined;
  }

  const nearby =
    location.nearbyPois
      ?.slice(0, 5)
      .map((poi) =>
        [
          poi.name,
          poi.distance ? `${poi.distance}米` : "",
          poi.type,
        ]
          .filter(Boolean)
          .join("/")
      )
      .join("、") || "";

  return {
    source: location.source,
    province: location.province,
    city: location.city,
    district: location.district,
    township: location.township,
    adcode: location.adcode,
    formattedAddress: location.formattedAddress,
    nearbyFoodPois: nearby,
  };
};

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

const FoodPhoto = ({
  src,
  label,
  ratio = "1.2",
  className = "",
  children,
}: {
  src?: string;
  label: string;
  ratio?: string;
  className?: string;
  children?: ReactNode;
}) => {
  const [errored, setErrored] = useState(false);

  return (
    <div
      className={`photo ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {src && !errored ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          className="dish-img"
          loading="lazy"
          onError={() => setErrored(true)}
        />
      ) : (
        <div className="img-fallback">{label}</div>
      )}
      {children}
    </div>
  );
};

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) => (
  <div className="field-block">
    <div className="field-head">
      <span className="eyebrow">{label}</span>
      {hint && <span className="muted field-hint">{hint}</span>}
    </div>
    {children}
  </div>
);

const ScreenHead = ({
  kicker,
  title,
  sub,
  flush = false,
}: {
  kicker: string;
  title: string;
  sub: string;
  flush?: boolean;
}) => (
  <div
    className="float-in"
    style={{ marginBottom: flush ? 0 : "1.4rem" }}
  >
    <span className="kicker">{kicker}</span>
    <h1 className="font-display screen-title">{title}</h1>
    <p className="muted screen-subtitle">{sub}</p>
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

const parseSyncPhotos = (
  photos?: Record<string, string>
) =>
  Object.fromEntries(
    Object.entries(photos ?? {})
      .filter(
        ([id, dataUrl]) =>
          Boolean(id) &&
          typeof dataUrl === "string" &&
          dataUrl.startsWith("data:image/")
      )
      .slice(-80)
  );

const cacheSyncedPhotos = (
  photos: Record<string, string>,
  targetUserId: string
) => {
  void Promise.all(
    Object.entries(photos).map(([id, dataUrl]) =>
      cacheMealPhoto(id, dataUrl, targetUserId).catch(() => false)
    )
  );
};

const inspirationKey = (item: InspirationItem) =>
  `${item.title.trim()}::${item.desc.trim()}`;

const dedupeInspirations = (
  items: InspirationItem[]
) => {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = inspirationKey(item);

    if (!item.title.trim() || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const MealCard = ({
  item,
  photoUrls,
  onSelect,
  index,
}: {
  item: MemoryItem;
  photoUrls: Record<string, string>;
  onSelect: (item: MemoryItem) => void;
  index: number;
}) => {
  const imageUrl = getMemoryImageUrl(item, photoUrls);

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="card diary-card float-in text-left"
      style={{ animationDelay: `${index * 35}ms` }}
    >
      <FoodPhoto
        src={imageUrl}
        label={item.food}
        ratio={index % 3 === 0 ? "0.82" : "1.05"}
        className="diary-photo"
      >
        <span className="diary-heart">
          <Heart size={16} fill="#fff" />
        </span>
      </FoodPhoto>

      <div className="diary-body">
        <div className="diary-date">
          {formatDateTime(item.time, {
            timezone: item.timezone,
            timeUnknown: item.timeUnknown,
          })}
        </div>
        <div className="font-display diary-food-title">
          {item.food}
        </div>
        <span className="tag-sage diary-tag">
          {[
            item.mealTime,
            item.mood,
            item.style,
          ]
            .filter(Boolean)
            .join(" · ") || "详情"}
        </span>
      </div>
    </button>
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

  const [userLocation, setUserLocation] =
    useState<UserLocation | null>(null);

  const [locationLoading, setLocationLoading] =
    useState(false);

  const [locationError, setLocationError] =
    useState("");

  const [userId, setUserId] = useState("");

  const [accountSession, setAccountSession] =
    useState<StoredAccount | null>(null);

  const [accountPanelOpen, setAccountPanelOpen] =
    useState(false);

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
    useState<InspirationItem[]>([]);

  // 我的菜单
  const [myMenu, setMyMenu] =
    useState<string[]>([]);

  const [newDish, setNewDish] =
    useState("");

  const [menuExpanded, setMenuExpanded] =
    useState(false);

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

  const [selectedMeal, setSelectedMeal] =
    useState<MemoryItem | null>(null);

  const cookCardRef = useRef<HTMLDivElement | null>(null);

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
    if (!accountPanelOpen) {
      return;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      const accountRoots = Array.from(
        document.querySelectorAll("[data-account-root]")
      );

      if (!accountRoots.some((root) => root.contains(target))) {
        setAccountPanelOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAccountPanelOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountPanelOpen]);

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

  const collectMemoryPhotos = useCallback(
    async (
      items: MemoryItem[],
      targetUserId: string
    ) => {
      const entries = await Promise.all(
        items
          .filter((item) => item.type === "like" && item.imageId)
          .slice(-MAX_SYNC_PHOTOS)
          .map(async (item) => {
            const id = item.imageId;

            if (!id) {
              return null;
            }

            const dataUrl =
              item.imageUrl ??
              photoUrls[id] ??
              (await readMealPhoto(id, targetUserId)) ??
              (await readMealPhoto(id));

            if (!dataUrl) {
              return null;
            }

            return [id, dataUrl] as const;
          })
      );

      const photos: Record<string, string> = {};
      let totalChars = 0;

      entries
        .filter(
          (entry): entry is readonly [string, string] =>
            Boolean(entry)
        )
        .forEach(([id, dataUrl]) => {
          if (totalChars + dataUrl.length > MAX_SYNC_PHOTO_CHARS) {
            return;
          }

          photos[id] = dataUrl;
          totalChars += dataUrl.length;
        });

      return photos;
    },
    [photoUrls]
  );

  const syncAccountData = useCallback(
    async ({
      session = accountSession,
      nextMemory = memory,
      nextMenu = myMenu,
      nextPhotos,
      mode,
    }: {
      session?: StoredAccount | null;
      nextMemory?: MemoryItem[];
      nextMenu?: string[];
      nextPhotos?: Record<string, string>;
      mode: "pull" | "push" | "merge";
    }) => {
      if (!session) {
        return null;
      }

      const shouldPullFirst =
        mode === "pull" || mode === "merge";
      const outgoingPhotos =
        nextPhotos ??
        (shouldPullFirst
          ? undefined
          : await collectMemoryPhotos(nextMemory, session.userId));
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
              photos: outgoingPhotos,
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
      const remotePhotos = parseSyncPhotos(data.record.photos);

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
        setPhotoUrls(remotePhotos);
        setMissingPhotoIds([]);
        cacheSyncedPhotos(remotePhotos, session.userId);
      } else if (mode === "merge") {
        const mergedMemory = mergeMemoryRecords(
          nextMemory,
          remoteMemory,
          session.userId
        );
        const mergedMenu = uniq([...nextMenu, ...remoteMenu]);
        const localPhotos =
          nextPhotos ??
          (await collectMemoryPhotos(mergedMemory, session.userId));
        const mergedPhotos = {
          ...remotePhotos,
          ...localPhotos,
        };

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
        setPhotoUrls(mergedPhotos);
        setMissingPhotoIds([]);
        cacheSyncedPhotos(mergedPhotos, session.userId);

        const saveResponse = await fetch("/api/sync", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            account: session.account,
            passcode: session.passcode,
            memory: mergedMemory,
            myMenu: mergedMenu,
            photos: mergedPhotos,
            updatedAt: new Date().toISOString(),
          }),
        });

        if (!saveResponse.ok) {
          throw new Error("sync save failed");
        }
      }

      setLastSyncedAt(new Date().toISOString());
      return data.record;
    },
    [accountSession, collectMemoryPhotos, memory, myMenu]
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

  const fetchLocationByIp = async () => {
    const response = await fetch("/api/location", {
      method: "GET",
    });

    if (!response.ok) {
      const errorData = (await response
        .json()
        .catch(() => null)) as { error?: string } | null;

      throw new Error(errorData?.error ?? "定位失败");
    }

    return (await response.json()) as UserLocation;
  };

  const locateUser = async () => {
    setLocationLoading(true);
    setLocationError("");

    try {
      if (!navigator.geolocation) {
        const fallbackLocation = await fetchLocationByIp();
        setUserLocation(fallbackLocation);
        toast.success("已使用城市级定位");
        return;
      }

      const position = await new Promise<GeolocationPosition>(
        (resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 5 * 60 * 1000,
            timeout: 9000,
          });
        }
      );

      const response = await fetch("/api/location", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      });

      if (!response.ok) {
        const errorData = (await response
          .json()
          .catch(() => null)) as { error?: string } | null;

        throw new Error(errorData?.error ?? "定位失败");
      }

      const data = (await response.json()) as UserLocation;
      setUserLocation(data);
      toast.success(`已定位到 ${getLocationLabel(data)}`);
    } catch (error) {
      try {
        const fallbackLocation = await fetchLocationByIp();
        setUserLocation(fallbackLocation);
        toast.success("精确定位未完成，已使用城市级定位");
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : error instanceof Error
              ? error.message
              : "定位失败";
        setLocationError(message);
        toast.error(message);
      }
    } finally {
      setLocationLoading(false);
    }
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

          return dedupeInspirations([
            ...manual.slice(0, 3),
            ...parsed,
          ]).slice(0, 12);
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
            location: formatLocationForPrompt(userLocation),
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
        window.setTimeout(() => {
          cookCardRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }, 80);

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
                mealTime: item.mealTime,
                mood: item.mood,
                style: item.style,
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

    const nextItem = {
        title: text,
        desc: "这是你自己想到的方向，可以直接带回今天的选择里。",
      };

    if (
      inspirations.some(
        (item) => inspirationKey(item) === inspirationKey(nextItem)
      )
    ) {
      toast.error("这条灵感已经在墙上了");
      return;
    }

    setInspirations((prev) =>
      dedupeInspirations([nextItem, ...prev]).slice(0, 12)
    );
    setManualInspiration("");
    toast.success("灵感已记下");
  };

  const addRandomInspiration = () => {
    const seen = new Set(inspirations.map(inspirationKey));
    const available = randomInspirationPrompts.filter(
      (item) => !seen.has(inspirationKey(item))
    );
    const picked = pickRandom(available);

    if (!picked) {
      toast("这组灵感已经翻完了，可以让 AI 补一些新的。");
      return;
    }

    setInspirations((prev) =>
      dedupeInspirations([picked, ...prev]).slice(0, 12)
    );
  };

  const visibleMenu = menuExpanded
    ? myMenu
    : myMenu.slice(0, 8);
  const hiddenMenuCount = Math.max(
    myMenu.length - visibleMenu.length,
    0
  );
  const selectedMealImage = selectedMeal
    ? getMemoryImageUrl(selectedMeal, photoUrls)
    : undefined;
  const likedMeals = memory.filter((item) => item.type === "like");
  const thisWeekMeals = likedMeals.filter((item) =>
    isThisWeek(new Date(item.time))
  );
  const thisMonthMeals = likedMeals.filter((item) =>
    isThisMonth(new Date(item.time))
  );
  const avgSatisfaction = likedMeals.length
    ? Math.min(9.8, 8.6 + likedMeals.length * 0.04).toFixed(1)
    : "--";
  const nearbyLabel = userLocation?.nearbyPois?.length
    ? "附近：" +
      userLocation.nearbyPois
        .slice(0, 3)
        .map((poi) => poi.name)
        .join("、")
    : "用于结合城市、区县和附近餐饮环境推荐。";
  const inspirationItems = inspirations.length
    ? inspirations
    : randomInspirationPrompts;
  const navItems = [
    {
      id: "today",
      label: "今天吃啥",
      icon: <HomeIcon size={21} />,
    },
    {
      id: "menu",
      label: "我的菜单",
      icon: <List size={21} />,
    },
    {
      id: "discover",
      label: "灵感",
      icon: <Sparkles size={21} />,
    },
    {
      id: "recent",
      label: "饮食日记",
      icon: <BookOpen size={21} />,
    },
  ] as const;

  const renderAccountControl = (compact = false) => (
    <div data-account-root className="account-root">
      <button
        type="button"
        onClick={() => setAccountPanelOpen((open) => !open)}
        aria-label="账号与同步"
        aria-expanded={accountPanelOpen}
        className={compact ? "avatar account-trigger" : "side-account"}
      >
        <span className={compact ? "" : "avatar"}>
          {accountSession ? (
            <Cloud size={compact ? 20 : 19} />
          ) : (
            <UserRound size={compact ? 20 : 19} />
          )}
        </span>
        {!compact && (
          <span className="side-account-copy">
            <strong>{accountSession ? accountSession.account : "小食"}</strong>
            <span className="muted">
              {accountSession
                ? lastSyncedAt
                  ? "已同步 · " + formatDateTime(lastSyncedAt)
                  : "已登录 · 可同步"
                : "本地记录 · " + shortUserId(userId)}
            </span>
          </span>
        )}
        <span
          className={
            accountSession
              ? "account-status-dot account-status-dot-on"
              : "account-status-dot"
          }
        />
      </button>

      {accountPanelOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="account-popover p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {accountSession ? "账号同步" : "登录同步"}
              </p>
              <p className="text-xs muted-text mt-1">
                {accountSession
                  ? "账号：" + accountSession.account
                  : "本地 ID：" + shortUserId(userId)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAccountPanelOpen(false)}
              aria-label="关闭账号面板"
              className="icon-button"
            >
              <X size={16} />
            </button>
          </div>

          {accountSession ? (
            <div className="mt-4 space-y-3">
              <p className="text-xs muted-text leading-6">
                {lastSyncedAt
                  ? "最近同步：" + formatDateTime(lastSyncedAt)
                  : "会同步菜单、饮食日记和日记照片"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void manualSync()}
                  disabled={syncLoading}
                  className="secondary-button inline-flex items-center justify-center gap-2 px-4 py-2 text-sm disabled:opacity-40"
                >
                  <RefreshCw size={15} />
                  {syncLoading ? "同步中" : "同步"}
                </button>
                <button
                  onClick={logoutAccount}
                  className="secondary-button inline-flex items-center justify-center gap-2 px-4 py-2 text-sm"
                >
                  <LogOut size={15} />
                  退出
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <input
                value={loginAccount}
                onChange={(event) =>
                  setLoginAccount(event.target.value)
                }
                placeholder="账号名"
                className="app-input w-full px-4 py-3 text-sm"
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
                className="app-input w-full px-4 py-3 text-sm"
              />
              <button
                onClick={() => void loginAndSync()}
                disabled={syncLoading}
                className="primary-button w-full px-5 py-3 text-sm disabled:opacity-40"
              >
                {syncLoading ? "同步中" : "登录并同步"}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );

  return (
    <main className="app-shell paper-grain">
      <aside className="sidebar">
        <div className="side-brand">
          <span className="brand-mark">吃啥</span>
          <span className="brand-tag">好好吃饭</span>
        </div>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPage(item.id)}
            className={page === item.id ? "side-link is-on" : "side-link"}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
        <div className="side-foot">{renderAccountControl()}</div>
      </aside>

      <div className="app-inner">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">吃啥</span>
            <span className="brand-tag">好好吃饭</span>
          </div>
          {renderAccountControl(true)}
        </header>

        <section className="content">
          {page === "today" && (
            <div className="screen-pad">
              <div className="float-in">
                <span className="kicker">好好吃饭 ·</span>
                <h1 className="font-display today-hero">
                  {getGreeting()}，<br />今天想吃点什么？
                </h1>
              </div>

              <div className="card-flat loc-row">
                <div className="loc-copy">
                  <span className="loc-pin">
                    <LocateFixed size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="loc-title">
                      {getLocationLabel(userLocation)}
                    </div>
                    <div className="muted loc-desc">
                      {nearbyLabel}
                    </div>
                    {locationError && (
                      <p className="loc-error">{locationError}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void locateUser()}
                  disabled={locationLoading}
                  className="btn btn-ghost loc-btn"
                >
                  <RefreshCw size={15} />
                  {locationLoading
                    ? "定位中"
                    : userLocation
                      ? "更新"
                      : "定位"}
                </button>
              </div>

              <div className="today-grid">
                <div className="today-controls">
                  <Field label="现在吃哪顿">
                    <div className="segmented">
                      {mealTimeOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setMealTime(item)}
                          aria-pressed={mealTime === item}
                          className={
                            mealTime === item
                              ? "seg-item is-on"
                              : "seg-item"
                          }
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="现在是什么状态" hint="可多选">
                    <div className="chip-wrap">
                      {moodOptions.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => toggleValue(item.label, setMood)}
                          aria-pressed={mood.includes(item.label)}
                          className={
                            mood.includes(item.label)
                              ? "chip is-on accent"
                              : "chip"
                          }
                        >
                          <span aria-hidden>{item.emoji}</span>
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field label="想吃什么类型" hint="可多选">
                    <div className="chip-wrap">
                      {styleOptions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => toggleValue(item, setStyle)}
                          aria-pressed={style.includes(item)}
                          className={
                            style.includes(item)
                              ? "chip is-on"
                              : "chip"
                          }
                        >
                          {item}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <button
                    type="button"
                    onClick={() => generateFood(false)}
                    disabled={loading}
                    className="btn btn-accent decide-btn"
                  >
                    <Sparkles size={20} />
                    {loading ? "正在想" : "帮我决定"}
                  </button>

                  <button
                    type="button"
                    onClick={spinFateBox}
                    disabled={fateLoading}
                    className="fate fate-card"
                  >
                    <div className="fate-card-inner">
                      <div>
                        <div className="font-hand fate-hand">交给命运</div>
                        <h3 className="font-display fate-title">
                          转盘盲盒模式
                        </h3>
                        <p className="fate-desc">
                          从菜单、日记和随机池里抽一道，停在哪道吃哪道。
                        </p>
                      </div>
                      <motion.div
                        animate={
                          fateLoading ? { rotate: 1080 } : { rotate: 0 }
                        }
                        transition={{ duration: 1.25, ease: "easeInOut" }}
                        className="wheel"
                      />
                    </div>
                  </button>

                  {fateResult && !fateLoading && (
                    <button
                      type="button"
                      onClick={acceptFateResult}
                      className="card fate-result float-in"
                    >
                      <span className="badge">
                        <Dice5 size={14} />
                        {fateResult.source}
                      </span>
                      <h2 className="font-display fate-result-food">
                        {fateResult.food}
                      </h2>
                      <p className="muted fate-result-copy">
                        点一下，把它放进今天的推荐
                      </p>
                    </button>
                  )}
                </div>

                <div className="today-result-col" id="today-result">
                  {loading && <ResultSkeleton />}

                  {food && !loading ? (
                    <div className="card result-card float-in" key={food}>
                      <FoodPhoto
                        src={getMenuPhoto(food, 0)}
                        label={food}
                        ratio="1.35"
                        className="result-photo"
                      >
                        <div className="result-photo-tags">
                          <span className="tag-chip">
                            {mealTime} · AI 替你选的
                          </span>
                        </div>
                      </FoodPhoto>
                      <div className="result-body">
                        <span className="eyebrow">
                          {style.join("、") || "随便"} · AI 的建议
                        </span>
                        <h2 className="font-display result-name">
                          {food}
                        </h2>
                        <div className="result-meta">
                          <span className="meta-pill">{mealTime}</span>
                          {mood.slice(0, 2).map((item) => (
                            <span key={item} className="meta-pill">
                              {item}
                            </span>
                          ))}
                        </div>
                        <p className="result-reason">{reason}</p>
                        <div className="result-actions">
                          {!acceptedFood ? (
                            <button
                              type="button"
                              onClick={() => acceptFood()}
                              className="btn btn-primary result-action-main"
                            >
                              <Check size={18} />
                              就这个了
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setFood("");
                                setReason("");
                                setAcceptedFood("");
                              }}
                              className="btn btn-primary result-action-main"
                            >
                              <Check size={18} />
                              已记入日记
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={declineFood}
                            disabled={Boolean(acceptedFood)}
                            className="btn btn-ghost result-action-secondary"
                          >
                            <RefreshCw size={17} />
                            换一换
                          </button>
                        </div>
                        <label className="btn btn-ghost photo-confirm-btn">
                          <Camera size={17} />
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
                    </div>
                  ) : (
                    !loading && (
                      <div className="result-empty">
                        <div className="result-empty-art">
                          <FoodPhoto
                            src={heroPhoto}
                            label="今天吃啥"
                            ratio="1.5"
                          />
                        </div>
                        <h3 className="font-display result-empty-title">
                          还没想好？
                        </h3>
                        <p className="muted result-empty-copy">
                          选好心情和口味，点「帮我决定」，<br />或者直接转一下盲盒，交给命运。
                        </p>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          )}

          {page === "menu" && (
            <div className="screen-pad">
              <ScreenHead
                kicker="家里这些我会做 ·"
                title="我的菜单"
                sub="把会做、想做的菜攒成一面墙，纠结时从这里抽。"
              />

              <div className="card identify-card">
                <div className="identify-text">
                  <span className="badge identify-badge">
                    <Camera size={14} />
                    拍冰箱
                  </span>
                  <h3 className="font-display identify-title">
                    拍一下现有食材，<br />帮你想今晚做什么
                  </h3>
                  <p className="muted identify-desc">
                    拍冰箱、案板或剩菜，先识别能用的食材，再生成顺手的清库存家常菜。
                  </p>
                  <label className="btn btn-primary identify-upload">
                    <Camera size={19} />
                    {identifyLoading ? "识别中" : "拍照识别食材"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={identifyFood}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="identify-photo">
                  <FoodPhoto src={identifyPhoto} label="食材" ratio="1" />
                </div>
              </div>

              {(identifyLoading || identifyResult) && (
                <div className="card-flat identify-result-panel">
                  {identifyLoading && <InlineSkeleton />}
                  {identifyResult && !identifyLoading && (
                    <div>
                      <span className="eyebrow">食材盘点</span>
                      <h3 className="font-display panel-title">
                        {identifyResult.dish}
                      </h3>
                      <p className="muted panel-copy">
                        {identifyResult.suggestion}
                      </p>

                      {identifyResult.ingredients.length > 0 && (
                        <div className="chip-wrap panel-chips">
                          {identifyResult.ingredients.map((item) => (
                            <span key={item} className="recipe-chip">
                              {item}
                            </span>
                          ))}
                        </div>
                      )}

                      {identifyResult.cookableDishes.length > 0 && (
                        <div className="recipe-suggestions">
                          {identifyResult.cookableDishes.map((item) => (
                            <div key={item.dish} className="recipe-suggestion p-4">
                              <h4 className="font-semibold">{item.dish}</h4>
                              <p className="muted-text mt-2 leading-7">
                                {item.reason}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {identifyResult.kind !== "non_food" && (
                        <div className="panel-actions">
                          {identifyResult.kind === "dish" && (
                            <button
                              type="button"
                              onClick={addIdentifiedDishToMenu}
                              className="btn btn-primary"
                            >
                              <Plus size={17} />
                              加入菜单
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={cookWithIdentifiedIngredients}
                            className="btn btn-ghost"
                          >
                            按这些食材推荐
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div ref={cookCardRef} className="card-flat cook-card scroll-mt-6">
                <div>
                  <span className="eyebrow">今晚做什么</span>
                  {cookResult ? (
                    <>
                      <h2 className="font-display panel-title">
                        {cookResult.dish}
                      </h2>
                      <p className="muted panel-copy">{cookResult.reason}</p>
                    </>
                  ) : (
                    <p className="muted panel-copy">
                      让 AI 从你的菜单里帮你决定今晚做什么。
                    </p>
                  )}
                </div>
                <div className="cook-actions">
                  {cookResult ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowCookRecipe(true)}
                        className="btn btn-primary"
                      >
                        就做这个
                      </button>
                      <button
                        type="button"
                        onClick={() => void generateCookAI()}
                        disabled={cookLoading}
                        className="btn btn-ghost"
                      >
                        换一个
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void generateCookAI()}
                      disabled={myMenu.length === 0 || cookLoading}
                      className="btn btn-primary"
                    >
                      <Sparkles size={18} />
                      {cookLoading ? "正在想" : "帮我决定今晚做什么"}
                    </button>
                  )}
                </div>
                {cookLoading && (
                  <div className="cook-loading">
                    <InlineSkeleton />
                  </div>
                )}
                {cookResult && showCookRecipe && (
                  <div className="inset-card cook-recipe">
                    <div>
                      <h3 className="font-semibold mb-3">食材</h3>
                      <div className="chip-wrap">
                        {cookResult.ingredients.map((item) => (
                          <span key={item} className="recipe-chip">
                            {item}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-3">做法</h3>
                      <ol className="space-y-3">
                        {cookResult.steps.map((step, index) => (
                          <li key={step} className="recipe-step">
                            <span>{index + 1}</span>
                            <p>{step}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <p className="muted panel-copy">{cookResult.tips}</p>
                  </div>
                )}
              </div>

              <div className="add-row menu-add-row">
                <input
                  value={newDish}
                  onChange={(event) => setNewDish(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      addDish();
                    }
                  }}
                  placeholder="加一道会做的菜，比如「葱油拌面」"
                  className="input"
                />
                <button
                  type="button"
                  onClick={addDish}
                  className="btn btn-accent add-icon-btn"
                  aria-label="添加菜品"
                >
                  <Plus size={19} />
                </button>
              </div>

              <div className="chip-wrap quick-add-row">
                {defaultMenuDishes.map((dish) => (
                  <button
                    key={dish}
                    type="button"
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
                    className="chip quick-add-chip"
                  >
                    + {dish}
                  </button>
                ))}
              </div>

              {myMenu.length === 0 ? (
                <div className="card-flat empty-state menu-empty">
                  <h3 className="font-display panel-title">菜单还是空的</h3>
                  <p className="muted panel-copy">
                    先加几道常做的菜，AI 才能帮你从家常选项里做决定。
                  </p>
                </div>
              ) : (
                <>
                  <div className="menu-grid">
                    {visibleMenu.map((dish, index) => (
                      <motion.div
                        key={dish}
                        layout
                        className="card menu-card float-in"
                        style={{ animationDelay: index * 30 + "ms" }}
                      >
                        <FoodPhoto
                          src={getMenuPhoto(dish, index)}
                          label={dish}
                          ratio="1.25"
                          className="menu-photo"
                        />
                        <div className="menu-card-body">
                          <div className="font-display menu-card-title">
                            {dish}
                          </div>
                          <div className="muted menu-card-note">
                            {index < defaultMenuDishes.length
                              ? "家常 · 可快速决定"
                              : "新加入 · 我的菜单"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteDish(dish)}
                          className="menu-heart"
                          aria-label={"删除 " + dish}
                        >
                          <Trash2 size={16} />
                        </button>
                      </motion.div>
                    ))}
                  </div>

                  {myMenu.length > 8 && (
                    <button
                      type="button"
                      onClick={() =>
                        setMenuExpanded((expanded) => !expanded)
                      }
                      className="btn btn-ghost menu-expand-btn"
                    >
                      {menuExpanded ? (
                        <>
                          收起菜单 <ChevronUp size={16} />
                        </>
                      ) : (
                        <>
                          展开剩余 {hiddenMenuCount} 道
                          <ChevronDown size={16} />
                        </>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {page === "discover" && (
            <div className="screen-pad">
              <ScreenHead
                kicker="换个角度想吃饭 ·"
                title="灵感墙"
                sub="不给答案，只给一点方向。今天就照着其中一条吃。"
              />

              <div className="insp-actions">
                <button
                  type="button"
                  onClick={() => void generateInspirations()}
                  className="btn btn-primary"
                >
                  <Sparkles size={19} />
                  AI 补满灵感墙
                </button>
                <button
                  type="button"
                  onClick={addRandomInspiration}
                  className="btn btn-ghost"
                >
                  翻一张
                </button>
              </div>
              <div className="add-row insp-add-row">
                <input
                  value={manualInspiration}
                  onChange={(event) =>
                    setManualInspiration(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      addManualInspiration();
                    }
                  }}
                  placeholder="写下一个你想到的小灵感..."
                  className="input"
                />
                <button
                  type="button"
                  onClick={addManualInspiration}
                  className="btn btn-accent add-icon-btn"
                  aria-label="记下灵感"
                >
                  <Plus size={19} />
                </button>
                <button
                  type="button"
                  onClick={() => startVoiceInput("inspiration")}
                  className="btn btn-ghost voice-btn"
                >
                  <Mic size={18} />
                  {voiceTarget === "inspiration" ? "听你说" : "语音"}
                </button>
              </div>

              <div className="insp-grid">
                {inspirationItems.map((item, index) => (
                  <button
                    key={item.title + index}
                    type="button"
                    onClick={() => {
                      setMood((prev) =>
                        uniq([...prev, item.title]).slice(-4)
                      );
                      setPage("today");
                    }}
                    className={
                      "insp-card float-in tone-" + String(index % 3)
                    }
                    style={{ animationDelay: index * 35 + "ms" }}
                  >
                    <span className="insp-bar" />
                    <span className="insp-num font-display">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="font-display insp-title">
                      {item.title}
                    </h3>
                    <p className="insp-desc">{item.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {page === "recent" && (
            <div className="screen-pad">
              <div className="diary-head-row">
                <ScreenHead
                  kicker="认真吃过的都算数 ·"
                  title="饮食日记"
                  sub="把每一顿好好吃过的饭，留成一面会发光的墙。"
                  flush
                />
                <button
                  type="button"
                  onClick={exportRecentMeals}
                  disabled={shareLoading}
                  className="btn btn-ghost export-btn"
                >
                  <Share2 size={17} />
                  {shareLoading ? "生成中" : "生成图"}
                </button>
              </div>

              <div className="diary-stats">
                <div className="stat">
                  <span className="stat-num font-display">
                    {thisMonthMeals.length}
                  </span>
                  <span className="stat-label">本月记录</span>
                </div>
                <div className="stat-div" />
                <div className="stat">
                  <span className="stat-num font-display">
                    {thisWeekMeals.length}
                  </span>
                  <span className="stat-label">本周</span>
                </div>
                <div className="stat-div" />
                <div className="stat">
                  <span className="stat-num font-display">
                    {avgSatisfaction}
                  </span>
                  <span className="stat-label">平均满足分</span>
                </div>
              </div>

              <div className="card-flat diary-manual-card">
                <div className="diary-manual-head">
                  <div>
                    <h3 className="font-display diary-manual-title">
                      自己记一顿
                    </h3>
                    <p className="muted diary-manual-copy">
                      不用等推荐，想到什么就直接写进日记。
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startVoiceInput("diary")}
                    className="btn btn-ghost voice-btn"
                  >
                    <Mic size={18} />
                    {voiceTarget === "diary" ? "听你说" : "语音"}
                  </button>
                </div>
                <div className="diary-manual-inputs">
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
                    className="input"
                  />
                  <input
                    value={manualDiaryNote}
                    onChange={(event) =>
                      setManualDiaryNote(event.target.value)
                    }
                    placeholder="状态备注，可不填"
                    className="input"
                  />
                  <button
                    type="button"
                    onClick={addManualDiary}
                    className="btn btn-accent"
                  >
                    记录
                  </button>
                </div>
              </div>

              {likedMeals.length === 0 ? (
                <div className="card-flat empty-state diary-empty">
                  还没有记录，今天去吃点什么吧
                </div>
              ) : (
                <div id="meal-wall" className="diary-wall">
                  {groupMeals(memory).map((group) => (
                    <section key={group.title}>
                      <h3 className="eyebrow diary-section-label">
                        {group.title}
                      </h3>
                      <div className="diary-grid">
                        {group.items.map((item, index) => (
                          <MealCard
                            key={item.food + item.time}
                            item={item}
                            photoUrls={photoUrls}
                            onSelect={setSelectedMeal}
                            index={index}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {insights.map((item, index) => {
                const lines = item.split("\n");

                return (
                  <div key={index} className="card-flat insight-card">
                    <h2 className="font-display insight-title">
                      {lines[0]}
                    </h2>
                    <p className="muted insight-copy">{lines[1]}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <nav className="bottom-nav">
        <div className="tabbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPage(item.id)}
              className={page === item.id ? "tab-btn is-on" : "tab-btn"}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {selectedMeal && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="饮食记录详情"
          onClick={() => setSelectedMeal(null)}
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="meal-detail-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="meal-detail-hero p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm opacity-70">
                    这一顿的完整记录
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold leading-tight">
                    {selectedMeal.food}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedMeal(null)}
                  aria-label="关闭详情"
                  className="icon-button"
                >
                  <X size={18} />
                </button>
              </div>
              <p className="mt-5 text-sm leading-7 opacity-80">
                好好吃饭这件事，有时候就是把自己从忙乱里轻轻捞回来。
              </p>
            </div>

            {selectedMealImage ? (
              <FoodPhoto
                src={selectedMealImage}
                label={selectedMeal.food}
                ratio="1.15"
                className="meal-detail-photo"
              />
            ) : (
              <div className="meal-detail-photo-empty">
                这顿没有照片，但记录本身已经很珍贵。
              </div>
            )}

            <div className="grid gap-3 p-5">
              <div className="detail-row detail-row-primary">
                <span>记录时间</span>
                <strong>
                  {formatDateTime(selectedMeal.time, {
                    timezone: selectedMeal.timezone,
                    timeUnknown: selectedMeal.timeUnknown,
                  })}
                </strong>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="detail-mini-card">
                  <span>餐段</span>
                  <strong>{selectedMeal.mealTime || "未记录"}</strong>
                </div>
                <div className="detail-mini-card">
                  <span>状态</span>
                  <strong>{selectedMeal.mood || "未记录"}</strong>
                </div>
                <div className="detail-mini-card">
                  <span>类型</span>
                  <strong>{selectedMeal.style || "未记录"}</strong>
                </div>
              </div>
              <p className="detail-note">
                以后回头看这一周，会发现自己不是随便糊弄过去的。
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}
