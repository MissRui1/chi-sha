import { z } from "zod";

const LocationRequestSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
});

type AmapPoi = {
  name?: string;
  type?: string;
  address?: string;
  distance?: string;
  location?: string;
};

type AmapRegeoResponse = {
  status?: string;
  info?: string;
  regeocode?: {
    formatted_address?: string;
    addressComponent?: {
      province?: string;
      city?: string | string[];
      district?: string;
      township?: string;
      adcode?: string;
    };
    pois?: AmapPoi[];
  };
};

type AmapIpResponse = {
  status?: string;
  info?: string;
  province?: string | string[];
  city?: string | string[];
  adcode?: string;
  rectangle?: string;
};

const readEnv = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const getAmapKey = () =>
  readEnv(process.env.AMAP_WEB_SERVICE_KEY) ??
  readEnv(process.env.GAODE_WEB_SERVICE_KEY) ??
  readEnv(process.env.AMAP_KEY);

const asText = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const candidate = forwarded?.split(",")[0]?.trim() || realIp?.trim();

  return candidate && candidate.includes(".") ? candidate : undefined;
};

const amapFetch = async <T>(url: URL): Promise<T> => {
  const response = await fetch(url, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Amap request failed: ${response.status}`);
  }

  return (await response.json()) as T;
};

const normalizePois = (pois: AmapPoi[] = []) =>
  pois
    .filter((poi) => poi.name)
    .slice(0, 8)
    .map((poi) => ({
      name: poi.name ?? "",
      type: poi.type ?? "",
      address: poi.address ?? "",
      distance: poi.distance ? Number(poi.distance) : undefined,
      location: poi.location ?? "",
    }));

const reverseGeocode = async ({
  key,
  latitude,
  longitude,
  accuracy,
}: {
  key: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
}) => {
  const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
  url.searchParams.set("key", key);
  url.searchParams.set("location", `${longitude.toFixed(6)},${latitude.toFixed(6)}`);
  url.searchParams.set("output", "JSON");
  url.searchParams.set("extensions", "all");
  url.searchParams.set("radius", "1000");
  url.searchParams.set("poitype", "餐饮服务");
  url.searchParams.set("roadlevel", "0");

  const data = await amapFetch<AmapRegeoResponse>(url);

  if (data.status !== "1" || !data.regeocode) {
    throw new Error(data.info || "Amap reverse geocode failed");
  }

  const component = data.regeocode.addressComponent ?? {};

  return {
    ok: true,
    source: "browser-geolocation",
    provider: "amap",
    latitude,
    longitude,
    accuracy,
    province: component.province ?? "",
    city: asText(component.city) || component.province || "",
    district: component.district ?? "",
    township: component.township ?? "",
    adcode: component.adcode ?? "",
    formattedAddress: data.regeocode.formatted_address ?? "",
    nearbyPois: normalizePois(data.regeocode.pois),
  };
};

const locateByIp = async (request: Request, key: string) => {
  const url = new URL("https://restapi.amap.com/v3/ip");
  const ip = getClientIp(request);

  url.searchParams.set("key", key);
  url.searchParams.set("output", "JSON");

  if (ip) {
    url.searchParams.set("ip", ip);
  }

  const data = await amapFetch<AmapIpResponse>(url);

  if (data.status !== "1") {
    throw new Error(data.info || "Amap IP location failed");
  }

  return {
    ok: true,
    source: "ip",
    provider: "amap",
    province: asText(data.province) ?? "",
    city: asText(data.city) ?? "",
    district: "",
    township: "",
    adcode: data.adcode ?? "",
    formattedAddress: [asText(data.province), asText(data.city)]
      .filter(Boolean)
      .join(""),
    nearbyPois: [],
  };
};

export async function POST(req: Request) {
  try {
    const key = getAmapKey();

    if (!key) {
      return Response.json(
        {
          error:
            "高德定位未配置：需要 AMAP_WEB_SERVICE_KEY 或 GAODE_WEB_SERVICE_KEY",
          ok: false,
        },
        { status: 503 }
      );
    }

    const body = LocationRequestSchema.parse(await req.json());

    if (
      typeof body.latitude === "number" &&
      typeof body.longitude === "number"
    ) {
      return Response.json(
        await reverseGeocode({
          key,
          latitude: body.latitude,
          longitude: body.longitude,
          accuracy: body.accuracy,
        })
      );
    }

    return Response.json(await locateByIp(req, key));
  } catch (error) {
    console.log(error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "定位失败",
        ok: false,
      },
      { status: 400 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const key = getAmapKey();

    if (!key) {
      return Response.json(
        {
          error:
            "高德定位未配置：需要 AMAP_WEB_SERVICE_KEY 或 GAODE_WEB_SERVICE_KEY",
          ok: false,
        },
        { status: 503 }
      );
    }

    return Response.json(await locateByIp(req, key));
  } catch (error) {
    console.log(error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "定位失败",
        ok: false,
      },
      { status: 400 }
    );
  }
}
