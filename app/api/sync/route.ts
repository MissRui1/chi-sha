import { createHash } from "crypto";
import { z } from "zod";

const MAX_SYNC_PHOTOS = 24;
const MAX_SYNC_PHOTO_BYTES = 2_500_000;

const PhotosSchema = z
  .record(
    z.string().min(1).max(180),
    z.string().startsWith("data:image/").max(900_000)
  )
  .refine(
    (photos) => Object.keys(photos).length <= MAX_SYNC_PHOTOS,
    "too many photos"
  )
  .refine(
    (photos) =>
      Object.values(photos).reduce(
        (sum, dataUrl) => sum + dataUrl.length,
        0
      ) <= MAX_SYNC_PHOTO_BYTES,
    "photos payload too large"
  );

const SyncPayloadSchema = z.object({
  account: z.string().trim().min(2).max(48),
  passcode: z.string().min(4).max(80),
  memory: z.array(z.unknown()).max(500).optional(),
  myMenu: z.array(z.string().trim().min(1)).max(120).optional(),
  photos: PhotosSchema.optional(),
  updatedAt: z.string().optional(),
});

const SyncRecordSchema = z.object({
  memory: z.array(z.unknown()).default([]),
  myMenu: z.array(z.string()).default([]),
  photos: z
    .record(z.string(), z.string())
    .default({}),
  updatedAt: z.string().default(""),
});

type SyncRecord = z.infer<typeof SyncRecordSchema>;

const readEnv = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const getKvConfig = () => {
  const url =
    readEnv(process.env.KV_REST_API_URL) ??
    readEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token =
    readEnv(process.env.KV_REST_API_TOKEN) ??
    readEnv(process.env.UPSTASH_REDIS_REST_TOKEN);

  if (!url || !token) {
    return null;
  }

  return {
    token,
    url: url.replace(/\/$/, ""),
  };
};

const normalizeAccount = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, "_");

const getSyncKey = (account: string, passcode: string) => {
  const digest = createHash("sha256")
    .update(`${normalizeAccount(account)}:${passcode}`)
    .digest("hex");

  return `chi-sha:sync:${digest}`;
};

const kvRequest = async <T>(
  command: unknown[]
): Promise<T | null> => {
  const config = getKvConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(`${config.url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command]),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`KV request failed: ${response.status}`);
  }

  const [entry] = (await response.json()) as Array<{
    error?: string;
    result?: T;
  }>;

  if (entry?.error) {
    throw new Error(entry.error);
  }

  return entry?.result ?? null;
};

const loadRecord = async (key: string): Promise<SyncRecord> => {
  const raw = await kvRequest<string>(["GET", key]);

  if (!raw) {
    return {
      memory: [],
      myMenu: [],
      photos: {},
      updatedAt: "",
    };
  }

  return SyncRecordSchema.parse(JSON.parse(raw));
};

export async function POST(req: Request) {
  try {
    if (!getKvConfig()) {
      return Response.json(
        {
          error:
            "云同步未配置：需要 KV_REST_API_URL/KV_REST_API_TOKEN 或 UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN",
          missing: [
            "KV_REST_API_URL 或 UPSTASH_REDIS_REST_URL",
            "KV_REST_API_TOKEN 或 UPSTASH_REDIS_REST_TOKEN",
          ],
          ok: false,
        },
        { status: 503 }
      );
    }

    const body = SyncPayloadSchema.parse(await req.json());
    const key = getSyncKey(body.account, body.passcode);
    const existing = await loadRecord(key);
    const incomingTime = body.updatedAt
      ? Date.parse(body.updatedAt)
      : 0;
    const existingTime = existing.updatedAt
      ? Date.parse(existing.updatedAt)
      : 0;

    if (body.memory || body.myMenu || body.photos) {
      const shouldWrite = incomingTime >= existingTime;
      const record: SyncRecord = shouldWrite
        ? {
            memory: body.memory ?? existing.memory,
            myMenu: body.myMenu ?? existing.myMenu,
            photos: body.photos ?? existing.photos,
            updatedAt:
              body.updatedAt ?? new Date().toISOString(),
          }
        : existing;

      if (shouldWrite) {
        await kvRequest(["SET", key, JSON.stringify(record)]);
      }

      return Response.json({
        ok: true,
        record,
        saved: shouldWrite,
      });
    }

    return Response.json({
      ok: true,
      record: existing,
      saved: false,
    });
  } catch (error) {
    console.log(error);
    return Response.json(
      {
        error: "同步失败",
        ok: false,
      },
      { status: 400 }
    );
  }
}
