/** Sequential batches: no count arithmetic and no writes for an obsolete viewer. */
export function createAuctionSeenQueue(options: {
  active: () => boolean;
  send: (ids: string[]) => Promise<void>;
}) {
  const done = new Set<string>();
  const pending = new Set<string>();
  let running = false;
  let stopped = false;
  async function flush() {
    if (running || stopped || !options.active()) return;
    running = true;
    try {
      while (pending.size && !stopped && options.active()) {
        const batch = Array.from(pending).slice(0, 200);
        batch.forEach(id => pending.delete(id));
        try {
          await options.send(batch);
          batch.forEach(id => { done.add(id); pending.delete(id); });
        } catch {
          // The observer can retry while the cards remain visible. Never assume success.
          break;
        }
      }
    } finally { running = false; }
  }
  return {
    add(ids: string[]) {
      if (stopped || !options.active()) return;
      ids.forEach(id => { if (id && !done.has(id)) pending.add(id); });
      return flush();
    },
    stop() { stopped = true; pending.clear(); },
  };
}
