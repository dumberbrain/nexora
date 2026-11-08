export type DiffLine = { kind: "same" | "add" | "remove"; text: string };

function splitLines(text: string): string[] {
  return text === "" ? [] : text.split(/\r?\n/);
}

/**
 * Line diff via longest common subsequence — meant for small inputs (settings files).
 * Lines come back in reading order; at a change point removals precede additions.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const w = b.length + 1;
  // lcs[i * w + j] = LCS length of a[i..] and b[j..]
  const lcs = new Uint32Array((a.length + 1) * w);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * w + j] =
        a[i] === b[j]
          ? (lcs[(i + 1) * w + j + 1] ?? 0) + 1
          : Math.max(lcs[(i + 1) * w + j] ?? 0, lcs[i * w + j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    const left = a[i];
    const right = b[j];
    if (left !== undefined && left === right) {
      out.push({ kind: "same", text: left });
      i++;
      j++;
    } else if (
      left !== undefined &&
      (right === undefined || (lcs[(i + 1) * w + j] ?? 0) >= (lcs[i * w + j + 1] ?? 0))
    ) {
      out.push({ kind: "remove", text: left });
      i++;
    } else if (right !== undefined) {
      out.push({ kind: "add", text: right });
      j++;
    }
  }
  return out;
}
