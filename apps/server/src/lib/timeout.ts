/**
 * Wait for `p` at most `ms` milliseconds. Resolves `true` when it settled in time (a rejection
 * counts as settled — callers log it through `onError`), `false` on timeout. Never rejects, and
 * the timer never keeps the process alive.
 */
export async function settleWithin(
  p: Promise<unknown>,
  ms: number,
  onError?: (err: unknown) => void,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
    timer.unref();
  });
  const settled = p.then(
    () => true as const,
    (err: unknown) => {
      onError?.(err);
      return true as const;
    },
  );
  try {
    return await Promise.race([settled, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
