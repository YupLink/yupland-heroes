// Client-side planning only. The server remains authoritative for every receipt.
export const transferQty = (n: number) => Math.round(n * 1e9) / 1e9;
export type StorageSource = 'backpack' | 'pockets' | 'warehouse' | 'chest';
export type StorageStack = { stackKey: string; count: number };

/** Respect the existing API's dust sweep when clipping an all-or-nothing deposit. */
export function fitStorageRequest(requested: number, movable: number, room: number, dust: number) {
  let qty = transferQty(Math.min(requested, movable, room));
  if (movable > room && transferQty(movable - qty) < dust) qty = transferQty(Math.max(0, movable - dust));
  return qty;
}

/** Includes the unused tail of this stack's last cell; never mixes item types. */
export function storageRoom(stacks: readonly StorageStack[], key: string, cells: number, cellSize: number, occupied?: number, strict = false) {
  const counts = new Map<string, number>();
  for (const s of stacks) counts.set(s.stackKey, transferQty((counts.get(s.stackKey) ?? 0) + s.count));
  const same = counts.get(key) ?? 0;
  const used = [...counts.values()].reduce((n, count) => n + Math.ceil(count / cellSize), 0);
  if (strict && Math.max(used, occupied ?? 0) > cells) return 0;
  return transferQty(Math.max(0, cells - Math.max(used, occupied ?? 0)) * cellSize + Math.ceil(same / cellSize) * cellSize - same);
}

export function transferResult(requested: number, moved: number, sourceTotal: number | undefined, source: StorageSource, lang: string) {
  const ru = lang === 'ru';
  const n = (v: number) => transferQty(v).toLocaleString(ru ? 'ru-RU' : 'en-US', { maximumFractionDigits: 9 });
  const head = ru ? `Перенесено ${n(moved)} из ${n(requested)}.` : `Moved ${n(moved)} of ${n(requested)}.`;
  if (moved >= requested) return head;
  if (sourceTotal === undefined) return head + (ru ? ` Не перенесено: ${n(requested - moved)}.` : ` Not moved: ${n(requested - moved)}.`);
  const place = { backpack: ['в рюкзаке', 'in backpack'], pockets: ['в карманах', 'in pockets'], warehouse: ['на складе', 'in warehouse'], chest: ['в сундуке', 'in chest'] }[source];
  return head + (ru ? ` Осталось ${place[0]}: ${n(Math.max(0, sourceTotal - moved))}.` : ` Remaining ${place[1]}: ${n(Math.max(0, sourceTotal - moved))}.`);
}

/** Synchronous guard: includes reconciliation; failed refresh keeps writes locked. */
export function createTransferGate() {
  let active = false, blocked = false;
  return {
    get blocked() { return blocked; },
    async run(action: () => Promise<void>, refresh: () => Promise<void>) {
      if (active || blocked) return false;
      active = true;
      try { await action(); }
      finally {
        try { await refresh(); blocked = false; }
        catch { blocked = true; }
        active = false;
      }
      return true;
    },
    async recover(refresh: () => Promise<void>) {
      if (active) return false;
      active = true;
      try { await refresh(); blocked = false; return true; }
      catch { blocked = true; return false; }
      finally { active = false; }
    },
  };
}
