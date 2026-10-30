// Keep this tab usable when browser storage is full or blocked; never claim durability.
const volatile = new Map<string, string | null>();

export function readStored(key: string): string | null {
  if (volatile.has(key)) return volatile.get(key) ?? null;
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeStored(key: string, value: string | null): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    volatile.delete(key);
    return true;
  } catch {
    volatile.set(key, value);
    window.dispatchEvent(new Event("hub-storage-error"));
    return false;
  }
}

/** Best-effort atomic replace across this course's keys, with rollback on quota errors. */
export function writeTransaction(entries: [string, string | null][]): boolean {
  const previous = new Map<string, string | null>();
  let snapshotComplete = false;
  try {
    for (const [key] of entries) previous.set(key, localStorage.getItem(key));
    snapshotComplete = true;
    for (const [key, value] of entries) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    for (const [key] of entries) volatile.delete(key);
    return true;
  } catch {
    if (snapshotComplete) {
      // Remove replacement values first: a larger replacement in a later key must
      // not consume the space needed to restore an earlier, larger original value.
      for (const [key] of previous) {
        try { localStorage.removeItem(key); } catch { /* Still attempt every restore below. */ }
      }
      for (const [key, value] of previous) {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch {
          // Preserve the pre-import view in this tab if persistent rollback fails.
          if (!volatile.has(key)) volatile.set(key, value);
        }
      }
    }
    window.dispatchEvent(new Event("hub-storage-error"));
    return false;
  }
}
