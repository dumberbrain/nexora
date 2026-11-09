const LIST_ITEM = /^\s*(?:\d+[.)]|[-*•])\s+(.+?)\s*$/;

/**
 * Clear sub-goals of a prompt: the items of a numbered or bulleted list (at least two). Anything
 * else is one goal — the heuristic never invents structure the user did not write.
 */
export function splitSubGoals(prompt: string): string[] {
  const items = prompt
    .split(/\r?\n/)
    .map((line) => LIST_ITEM.exec(line)?.[1])
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  return items.length >= 2 ? items : [prompt.trim()];
}
