/**
 * The first JSON object in model output: a ```json fenced block, the whole text, or the span
 * from the first `{` to the last `}`. Returns undefined when nothing parses.
 */
export function extractJson(text: string): unknown {
  const candidates: string[] = [];
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) candidates.push(fenced[1]);
  candidates.push(text);
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  for (const c of candidates) {
    try {
      const value = JSON.parse(c.trim()) as unknown;
      if (value !== null && typeof value === "object") return value;
    } catch {
      /* try the next candidate */
    }
  }
  return undefined;
}
