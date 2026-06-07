import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const DEFAULT_INPUT = "data/samples/dianping-food-poi-sample.json";
const DEFAULT_OUT_DIR = "data/out";

const F = {
  shopTags: "\u5e97\u94fa\u6807\u7b7e",
  province: "\u7701\u4efd",
  city: "\u57ce\u5e02",
  district: "\u533a\u57df",
  rating: "\u5e97\u94fa\u8bc4\u5206\u661f\u7ea7",
  reviewCount: "\u5e97\u94fa\u603b\u8bc4\u8bba\u6570\u91cf",
  lat: "\u7ecf\u7eac\u5ea6_lat",
  lng: "\u7ecf\u7eac\u5ea6_lng",
  shopName: "\u5e97\u94fa\u540d\u5b57",
  ratingDetails: "\u8bc4\u5206\u8be6\u60c5",
  avgPrice: "\u4eba\u5747",
  subCategory: "\u5c0f\u7c7b",
  primaryCategory: "\u5927\u7c7b",
  isOverseas: "\u662f\u5426\u6d77\u5916\u5e97\u94fa",
  delivery: "\u662f\u5426\u5916\u5356",
  menu1: "\u83dc\u53551",
  menu2: "\u83dc\u53552",
  detailName: "\u540d\u5b57",
  dishName: "\u83dc\u54c1\u540d",
  recommendationCount: "\u63a8\u8350\u6570\u91cf",
  recommendationShort: "\u63a8\u8350\u6570",
  imageUrl: "\u56fe\u7247\u94fe\u63a5",
  image: "\u56fe\u7247",
  yes: "\u662f",
  no: "\u5426"
};

const LIST_SPLIT_RE = new RegExp("[,\\uFF0C\\u3001]");
const PAIR_SPLIT_RE = new RegExp("[:\\uFF1A]");

const argv = parseArgs(process.argv.slice(2));
const inputPath = argv.input || DEFAULT_INPUT;
const outDir = argv.out || DEFAULT_OUT_DIR;

const RawShopSchema = z
  .object({
    shopuuid: z.union([z.string(), z.number()]).optional(),
    shopid: z.union([z.string(), z.number()]).optional(),
    [F.shopTags]: z.union([z.array(z.string()), z.string()]).optional(),
    [F.province]: z.string().optional(),
    [F.city]: z.string().optional(),
    [F.district]: z.string().optional(),
    [F.rating]: z.union([z.string(), z.number()]).optional(),
    [F.reviewCount]: z.union([z.string(), z.number()]).optional(),
    [F.lat]: z.union([z.string(), z.number()]).optional(),
    [F.lng]: z.union([z.string(), z.number()]).optional(),
    [F.shopName]: z.string().optional(),
    [F.ratingDetails]: z.union([z.array(z.string()), z.record(z.string(), z.unknown()), z.string()]).optional(),
    [F.avgPrice]: z.union([z.string(), z.number()]).optional(),
    [F.subCategory]: z.string().optional(),
    [F.primaryCategory]: z.string().optional(),
    [F.isOverseas]: z.union([z.boolean(), z.string(), z.number()]).optional(),
    [F.delivery]: z.union([z.boolean(), z.string(), z.number()]).optional(),
    [F.menu1]: z.union([z.array(z.string()), z.string()]).optional(),
    [F.menu2]: z.unknown().optional()
  })
  .passthrough();

const RestaurantSchema = z.object({
  id: z.string(),
  source_platform: z.string(),
  source_shop_uuid: z.string().nullable(),
  source_shop_id: z.string().nullable(),
  name: z.string().min(1),
  province: z.string().nullable(),
  city: z.string().nullable(),
  district: z.string().nullable(),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  review_count: z.number().int().nonnegative().nullable(),
  avg_price_cny: z.number().nonnegative().nullable(),
  primary_category: z.string().nullable(),
  sub_category: z.string().nullable(),
  is_overseas: z.boolean().nullable(),
  delivery_supported: z.boolean().nullable(),
  tags: z.array(z.string()),
  rating_details: z.record(z.string(), z.number()),
  updated_at: z.string()
});

const DishSchema = z.object({
  id: z.string(),
  restaurant_id: z.string(),
  source_platform: z.string(),
  name: z.string().min(1),
  category: z.string().nullable(),
  recommendation_count: z.number().int().nonnegative().nullable(),
  image_url: z.string().nullable(),
  is_from_menu_detail: z.boolean(),
  updated_at: z.string()
});

const rows = await loadRows(inputPath);
const now = new Date().toISOString();
const restaurants = new Map();
const dishes = new Map();
const skipped = [];
const warnings = [];

for (const [index, row] of rows.entries()) {
  const parsed = RawShopSchema.safeParse(row);
  if (!parsed.success) {
    skipped.push({ index, reason: "raw_schema_error", detail: parsed.error.flatten() });
    continue;
  }

  const raw = parsed.data;
  const restaurant = normalizeRestaurant(raw, now);
  const checkedRestaurant = RestaurantSchema.safeParse(restaurant);

  if (!checkedRestaurant.success) {
    skipped.push({
      index,
      reason: "restaurant_schema_error",
      name: raw[F.shopName] || null,
      detail: checkedRestaurant.error.flatten()
    });
    continue;
  }

  if (restaurants.has(restaurant.id)) {
    warnings.push({ index, reason: "duplicate_restaurant", id: restaurant.id, name: restaurant.name });
  }
  restaurants.set(restaurant.id, checkedRestaurant.data);

  for (const dish of normalizeDishes(raw, restaurant, now)) {
    const checkedDish = DishSchema.safeParse(dish);
    if (!checkedDish.success) {
      warnings.push({
        index,
        reason: "dish_schema_error",
        restaurant_id: restaurant.id,
        dish_name: dish.name,
        detail: checkedDish.error.flatten()
      });
      continue;
    }
    if (!dishes.has(dish.id)) {
      dishes.set(dish.id, checkedDish.data);
    }
  }
}

await mkdir(outDir, { recursive: true });
await writeJsonl(path.join(outDir, "restaurants.jsonl"), [...restaurants.values()]);
await writeJsonl(path.join(outDir, "dishes.jsonl"), [...dishes.values()]);
await writeFile(
  path.join(outDir, "report.json"),
  JSON.stringify(
    {
      input: inputPath,
      restaurant_count: restaurants.size,
      dish_count: dishes.size,
      skipped_count: skipped.length,
      warning_count: warnings.length,
      skipped,
      warnings
    },
    null,
    2
  ),
  "utf8"
);

console.log(`Normalized ${restaurants.size} restaurants and ${dishes.size} dishes.`);
console.log(`Report: ${path.join(outDir, "report.json")}`);

function normalizeRestaurant(raw, updatedAt) {
  const sourceShopUuid = stringifyNullable(raw.shopuuid);
  const sourceShopId = stringifyNullable(raw.shopid);
  const name = cleanText(raw[F.shopName]) || fallbackName(sourceShopUuid, sourceShopId);
  const latitude = toNumberOrNull(raw[F.lat]);
  const longitude = toNumberOrNull(raw[F.lng]);
  const identity = sourceShopUuid || sourceShopId || `${name}:${latitude ?? ""}:${longitude ?? ""}`;

  return {
    id: stableId("restaurant", identity),
    source_platform: "dianping_authorized_dataset",
    source_shop_uuid: sourceShopUuid,
    source_shop_id: sourceShopId,
    name,
    province: cleanText(raw[F.province]) || null,
    city: cleanText(raw[F.city]) || null,
    district: cleanText(raw[F.district]) || null,
    latitude,
    longitude,
    rating: toNumberOrNull(raw[F.rating]),
    review_count: toIntegerOrNull(raw[F.reviewCount]),
    avg_price_cny: parseMoney(raw[F.avgPrice]),
    primary_category: cleanText(raw[F.primaryCategory]) || null,
    sub_category: cleanText(raw[F.subCategory]) || null,
    is_overseas: toBooleanOrNull(raw[F.isOverseas]),
    delivery_supported: toBooleanOrNull(raw[F.delivery]),
    tags: normalizeStringArray(raw[F.shopTags]),
    rating_details: normalizeRatingDetails(raw[F.ratingDetails]),
    updated_at: updatedAt
  };
}

function normalizeDishes(raw, restaurant, updatedAt) {
  const detailByName = new Map();

  for (const detail of normalizeMenuDetails(raw[F.menu2])) {
    const name = cleanText(detail.name);
    if (name) {
      detailByName.set(name, detail);
    }
  }

  const menuNames = new Set([...normalizeStringArray(raw[F.menu1]), ...[...detailByName.keys()]]);

  return [...menuNames].map((name) => {
    const detail = detailByName.get(name);
    return {
      id: stableId("dish", `${restaurant.id}:${name}`),
      restaurant_id: restaurant.id,
      source_platform: restaurant.source_platform,
      name,
      category: restaurant.sub_category,
      recommendation_count: detail?.recommendation_count ?? null,
      image_url: detail?.image_url ?? null,
      is_from_menu_detail: Boolean(detail),
      updated_at: updatedAt
    };
  });
}

async function loadRows(filePath) {
  const text = await readFile(filePath, "utf8");
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (filePath.endsWith(".jsonl")) {
    return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }

  const parsed = JSON.parse(trimmed);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function normalizeMenuDetails(value) {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return normalizeMenuDetails(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      return {
        name: item.name || item[F.detailName] || item.title || item[F.dishName] || "",
        recommendation_count: toIntegerOrNull(
          item.recommendation_count || item[F.recommendationCount] || item.recommend || item[F.recommendationShort]
        ),
        image_url: cleanText(item.image_url || item[F.imageUrl] || item.image || item[F.image]) || null
      };
    })
    .filter(Boolean);
}

function normalizeRatingDetails(value) {
  if (!value) return {};
  if (typeof value === "string") return normalizeRatingDetails(value.split(LIST_SPLIT_RE));
  if (!Array.isArray(value) && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, val]) => [cleanText(key), toNumberOrNull(val)])
        .filter(([key, val]) => key && val !== null)
    );
  }

  return Object.fromEntries(
    normalizeStringArray(value)
      .map((item) => {
        const [key, val] = item.split(PAIR_SPLIT_RE);
        return [cleanText(key), toNumberOrNull(val)];
      })
      .filter(([key, val]) => key && val !== null)
  );
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map(cleanText).filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(LIST_SPLIT_RE).map(cleanText).filter(Boolean);
}

function parseMoney(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(num) ? num : null;
}

function toIntegerOrNull(value) {
  const num = toNumberOrNull(value);
  return num === null ? null : Math.trunc(num);
}

function toBooleanOrNull(value) {
  if (typeof value === "boolean") return value;
  if (value === null || value === undefined || value === "") return null;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", F.yes].includes(normalized)) return true;
  if (["false", "0", "no", "n", F.no].includes(normalized)) return false;
  return null;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

function stringifyNullable(value) {
  const text = cleanText(value);
  return text || null;
}

function fallbackName(sourceShopUuid, sourceShopId) {
  return `unknown_shop_${sourceShopUuid || sourceShopId || "missing_id"}`;
}

function stableId(prefix, value) {
  return `${prefix}_${createHash("sha1").update(String(value)).digest("hex").slice(0, 16)}`;
}

async function writeJsonl(filePath, values) {
  await writeFile(filePath, values.map((value) => JSON.stringify(value)).join("\n") + "\n", "utf8");
}

function parseArgs(args) {
  return Object.fromEntries(
    args
      .map((arg) => {
        const match = arg.match(/^--([^=]+)=(.*)$/);
        return match ? [match[1], match[2]] : null;
      })
      .filter(Boolean)
  );
}
