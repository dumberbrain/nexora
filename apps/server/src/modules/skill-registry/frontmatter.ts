/**
 * Minimal YAML front matter reader for SKILL.md / command / agent markdown files. Only flat
 * `key: value` pairs are needed; anything else is ignored rather than guessed.
 */
export interface FrontMatter {
  fields: Record<string, string>;
  body: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?/;

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && (t[0] === '"' || t[0] === "'") && t.at(-1) === t[0]) return t.slice(1, -1);
  return t;
}

export function parseFrontMatter(text: string): FrontMatter {
  const clean = text.replace(/^﻿/, "");
  const m = FENCE.exec(clean);
  if (!m) return { fields: {}, body: clean.trim() };
  const fields: Record<string, string> = {};
  for (const line of (m[1] ?? "").split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (kv?.[1] !== undefined) fields[kv[1]] = unquote(kv[2] ?? "");
  }
  return { fields, body: clean.slice(m[0].length).trim() };
}
