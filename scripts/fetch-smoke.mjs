import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { isAllowedByRobots } from "./robots-lib.mjs";

const DEFAULT_OUT = "data/out/fetch-smoke-report.json";
const DEFAULT_AGENT = "ChiShaResearchBot/0.1 (+contact@example.com)";
const MAX_BYTES = 2 * 1024 * 1024;

const argv = parseArgs(process.argv.slice(2));
const urls = argv.url ? arrayArg(argv.url) : [];
const userAgent = argv.agent || DEFAULT_AGENT;
const delayMs = Number(argv["delay-ms"] || 3000);
const outPath = argv.out || DEFAULT_OUT;
const shouldCheckRobots = argv.robots !== "false";

if (urls.length === 0) {
  console.error(
    "Usage: node scripts/fetch-smoke.mjs --url=https://authorized.example.com/page [--delay-ms=3000] [--robots=false]"
  );
  process.exit(1);
}

const results = [];

for (const [index, targetUrl] of urls.entries()) {
  if (index > 0) await sleep(delayMs);

  const startedAt = new Date().toISOString();
  const result = {
    url: targetUrl,
    started_at: startedAt,
    user_agent: userAgent,
    robots: null,
    response: null,
    error: null
  };

  try {
    const url = new URL(targetUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error(`Unsupported protocol: ${url.protocol}`);
    }

    if (shouldCheckRobots) {
      result.robots = await robotsDecision(url, userAgent);
      if (!result.robots.allowed) {
        results.push(result);
        continue;
      }
    }

    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": userAgent
      }
    });
    const body = await readLimitedText(response, MAX_BYTES);

    result.response = {
      status: response.status,
      ok: response.ok,
      content_type: response.headers.get("content-type"),
      bytes_read: body.bytesRead,
      truncated: body.truncated,
      sha256: createHash("sha256").update(body.text).digest("hex"),
      title: extractTitle(body.text)
    };
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  results.push(result);
}

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(
  outPath,
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      authorized_only: true,
      url_count: urls.length,
      results
    },
    null,
    2
  ),
  "utf8"
);

const fetched = results.filter((result) => result.response).length;
const blocked = results.filter((result) => result.robots && !result.robots.allowed).length;
const errors = results.filter((result) => result.error).length;

console.log(`Smoke checked ${urls.length} URL(s): ${fetched} fetched, ${blocked} robots-blocked, ${errors} error(s).`);
console.log(`Report: ${outPath}`);

async function robotsDecision(url, userAgent) {
  const robotsUrl = `${url.origin}/robots.txt`;
  const response = await fetch(robotsUrl, {
    headers: { "user-agent": userAgent }
  });

  if (!response.ok) {
    return { robotsUrl, status: response.status, allowed: false, matchedRule: null };
  }

  const robots = await response.text();
  return { robotsUrl, status: response.status, ...isAllowedByRobots(robots, userAgent, url.pathname || "/") };
}

async function readLimitedText(response, maxBytes) {
  if (!response.body) {
    const text = await response.text();
    return { text: text.slice(0, maxBytes), bytesRead: Buffer.byteLength(text), truncated: text.length > maxBytes };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const remaining = maxBytes - bytesRead;
    bytesRead += value.byteLength;

    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }

    const slice = value.byteLength > remaining ? value.slice(0, remaining) : value;
    text += decoder.decode(slice, { stream: true });

    if (value.byteLength > remaining) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }

  text += decoder.decode();
  return { text, bytesRead, truncated };
}

function extractTitle(text) {
  const match = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return null;
  return decodeBasicEntities(match[1]).replace(/\s+/g, " ").trim() || null;
}

function decodeBasicEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
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

function arrayArg(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
