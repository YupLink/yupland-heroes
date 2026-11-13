import type { RepairAllQuote } from '@/server/api/mine-office/mine-office-repair-all';
import type { RepairAllCell, RepairCost } from '@/server/api/mine-office/repair-all-plan';

export type RepairScope = readonly Pick<RepairAllCell, 'mapId' | 'q' | 'r'>[];
const key = (c: RepairScope[number]) => JSON.stringify([c.mapId, c.q, c.r]);

/** Narrow the server's estimate to the displayed group, without inventing prices. */
export function repairGroupQuote(quote: RepairAllQuote, scope: RepairScope): RepairAllQuote {
  const allowed = new Set(scope.map(key));
  const mines = quote.mines.filter(m => allowed.has(key(m)));
  const selected = new Set(mines.map(key));
  const total: RepairCost = {}, short: RepairCost = {};
  for (const m of mines) {
    for (const [resource, amount] of Object.entries(m.cost)) {
      const k = resource as keyof RepairCost;
      total[k] = (total[k] ?? 0) + Number(amount);
    }
  }
  // A shortage reveals the balance used by this same server estimate.
  // No global shortage means any subset is affordable for that resource.
  for (const [resource, amount] of Object.entries(total)) {
    const k = resource as keyof RepairCost;
    if ((quote.short[k] ?? 0) <= 0) continue;
    const have = (quote.total[k] ?? 0) - quote.short[k]!;
    const missing = Number(amount) - have;
    if (missing > 0) short[k] = missing;
  }
  return {
    ...quote, mines, total, short,
    cells: quote.cells.filter(c => selected.has(key(c))),
    skipped: quote.skipped.filter(c => allowed.has(key(c))),
  };
}
