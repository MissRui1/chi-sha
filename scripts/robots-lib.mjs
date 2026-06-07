export function isAllowedByRobots(text, userAgent, pathname) {
  const ua = userAgent.toLowerCase();
  const groups = parseRobots(text);
  const candidates = groups.filter((group) => group.agents.some((agent) => agent === "*" || ua.includes(agent)));
  const rules = candidates.flatMap((group) => group.rules);

  if (rules.length === 0) return { allowed: true, matchedRule: null };

  const matched = rules
    .filter((rule) => matchesRule(rule.path, pathname))
    .sort((a, b) => b.path.length - a.path.length || allowPriority(b) - allowPriority(a))[0];

  if (!matched) return { allowed: true, matchedRule: null };
  return { allowed: matched.type === "allow", matchedRule: matched };
}

export function parseRobots(text) {
  const groups = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;

    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      if (value === "" && key === "disallow") continue;
      current.rules.push({ type: key, path: value || "/" });
    }
  }

  return groups;
}

function matchesRule(rulePath, pathname) {
  if (!rulePath) return false;
  if (!rulePath.includes("*") && !rulePath.endsWith("$")) return pathname.startsWith(rulePath);

  const anchored = rulePath.endsWith("$");
  const normalized = anchored ? rulePath.slice(0, -1) : rulePath;
  const pattern = normalized
    .split("*")
    .map((part) => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp(`^${pattern}${anchored ? "$" : ""}`);
  return regex.test(pathname);
}

function allowPriority(rule) {
  return rule.type === "allow" ? 1 : 0;
}
