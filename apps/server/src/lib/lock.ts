/**
 * Tiny in-process keyed mutex. AMMAS runs as ONE server process per restaurant, so money-changing steps for the same bill
 * (payment, refund) and the table claim are queued here. The atomic database updates stay in place as the second line of
 * defence; this lock makes the guarantee independent of how the database implements concurrent updates.
 */
const tails = new Map<string, Promise<void>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const tail = prev.then(() => gate);
  tails.set(key, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
