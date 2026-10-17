/**
 * Pull the first JSON object out of model text. Ollama Cloud has no structured-output mode ✅, so the
 * drafter asks for JSON in the prompt and parses defensively: strips code fences and prose, handles
 * braces inside strings. Returns undefined when nothing parses. The caller still validates with zod.
 */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  for (let start = cleaned.indexOf("{"); start !== -1; start = cleaned.indexOf("{", start + 1)) {
    const end = matchingBrace(cleaned, start);
    if (end === -1) continue;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      // not valid JSON from this start; try the next "{"
    }
  }
  return undefined;
}

function matchingBrace(s: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === "\\") i += 1;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}
