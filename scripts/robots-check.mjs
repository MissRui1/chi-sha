import { isAllowedByRobots } from "./robots-lib.mjs";

const argv = parseArgs(process.argv.slice(2));
const urls = argv.url ? arrayArg(argv.url) : [];
const userAgent = argv.agent || "ChiShaResearchBot";

if (urls.length === 0) {
  console.error("Usage: node scripts/robots-check.mjs --url=https://example.com/path [--agent=BotName]");
  process.exit(1);
}

for (const targetUrl of urls) {
  const url = new URL(targetUrl);
  const robotsUrl = `${url.origin}/robots.txt`;

  try {
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": userAgent }
    });

    if (!response.ok) {
      console.log(JSON.stringify({ url: targetUrl, robotsUrl, status: response.status, allowed: false }));
      continue;
    }

    const robots = await response.text();
    const decision = isAllowedByRobots(robots, userAgent, url.pathname || "/");
    console.log(JSON.stringify({ url: targetUrl, robotsUrl, ...decision }));
  } catch (error) {
    console.log(
      JSON.stringify({
        url: targetUrl,
        robotsUrl,
        allowed: false,
        error: error instanceof Error ? error.message : String(error)
      })
    );
  }
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
