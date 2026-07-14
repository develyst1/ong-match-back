export class JsonExtractError extends Error {}

/** Pull the first balanced `{...}` object out of an AI reply and JSON.parse it. */
export function extractJson<T>(content: string): T {
  const start = content.indexOf("{");
  if (start === -1) throw new JsonExtractError("no object found");
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(content.slice(start, i + 1)) as T;
        } catch (e) {
          throw new JsonExtractError(String(e));
        }
      }
    }
  }
  throw new JsonExtractError("unbalanced braces");
}
