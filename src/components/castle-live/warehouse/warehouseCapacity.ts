import { CELL_SIZE } from '../../../lib/hero/backpackCells';
import { storageRoom, transferQty } from '../../../lib/storageTransfer';
import type { StoredItem } from './WarehouseScreen';
import type { TransferPart } from './warehouseTransfer';

type Bin = { items: StoredItem[]; capacity?: number; occupied?: number };
export function fitWarehousePlan(parts: TransferPart[], toWarehouse: boolean, warehouse: Bin, backpack: Bin, pockets: Bin) {
  const bins = [warehouse, backpack, pockets].map(b => ({ ...b, stacks: b.items.map(i => ({ stackKey: i.stackKey ?? i.id, count: i.count })) }));
  const fitting: TransferPart[] = [];
  for (const part of parts) {
    const key = part.item.stackKey ?? part.item.id;
    // Resources taken from the warehouse go to the account, not backpack cells.
    if (!toWarehouse && (part.item.kind === 'resource' || key.startsWith('resource:'))) { fitting.push(part); continue; }
    const bin = bins[toWarehouse ? 0 : part.item.potion || key.startsWith('potion:') ? 2 : 1];
    if (bin.capacity === undefined) { fitting.push(part); continue; } // Unknown capacity: let existing API decide.
    const room = storageRoom(bin.stacks, key, bin.capacity, CELL_SIZE, bin.occupied, bin === bins[2]);
    const qty = transferQty(Math.min(part.qty, room));
    if (qty <= 0) continue;
    const before = bin.stacks.filter(s => s.stackKey === key).reduce((n, s) => n + s.count, 0);
    const addedCells = Math.ceil(transferQty(before + qty) / CELL_SIZE) - Math.ceil(before / CELL_SIZE);
    bin.stacks.push({ stackKey: key, count: qty });
    if (bin.occupied !== undefined) bin.occupied += addedCells;
    fitting.push({ ...part, qty });
  }
  return fitting;
}
