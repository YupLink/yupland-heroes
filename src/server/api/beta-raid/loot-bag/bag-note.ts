// Журнал сделок (ПРАВИЛА §8.13): что забрали из мешочка и что в него положили.
// Мешочек — путь товара от игрока к игроку (не влезло у одного — поднял
// другой; положил один — забрал другой), как общая полка склада; без строки
// панель «$ Экономика» не видела бы, куда уехала добыча. У «забрать»
// контрагент — тот, чья добыча выпала (свой мешочек — без него), у «положить»
// — никто: кто заберёт, ещё неизвестно. Best-effort: ничего не бросает.
import { noteTrades } from "@/server/api/beta-raid/econ/trade-journal";
import { stackItemKey } from "@/server/api/beta-raid/econ/trade-keys";
import type { BagActor } from "@/server/api/beta-raid/loot-bag/bag-actor";

/** Стопка мешочка глазами забора: вид, подпись, сколько и чей мешочек. */
export type BagStackRow = {
  stackKey: string;
  kind: string;
  refId: string | null;
  name: string;
  image: string | null;
  count: number | string;
  droppedBy: string | null;
};

type Note = {
  actor: BagActor;
  bag: { q: number; r: number };
  stack: Omit<BagStackRow, "droppedBy" | "count"> & { droppedBy?: string | null };
  qty: number;
  ref: string;
};

function note(o: Note, side: "take" | "put"): Promise<void> {
  const other = side === "take" && o.stack.droppedBy && o.stack.droppedBy !== o.actor.account;
  return noteTrades([
    {
      accountId: o.actor.account,
      counterparty: other ? (o.stack.droppedBy ?? null) : null,
      mapId: o.actor.mapId,
      q: o.bag.q,
      r: o.bag.r,
      source: "loot_bag",
      side,
      itemKey: stackItemKey(o.stack.stackKey, o.stack.kind, o.stack.refId, o.stack.name),
      itemName: o.stack.name,
      qty: o.qty,
      ref: o.ref,
    },
  ]);
}

/** Забрал из мешочка. */
export const noteBagTake = (o: Note): Promise<void> => note(o, "take");

/** Положил в мешочек. */
export const noteBagPut = (o: Note): Promise<void> => note(o, "put");
