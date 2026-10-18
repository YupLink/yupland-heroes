// Журнал сделок (ПРАВИЛА §8.13): что положили в обычный сундук и что забрали.
// Сундук общий — путь товара от игрока к игроку, как общая полка склада; без
// строки панель «$ Экономика» не видела бы, куда уехал товар. Контрагента нет:
// чьё лежит в общем сундуке, база не помнит. Best-effort: ничего не бросает.
import { noteTrades, type TradeNote } from "@/server/api/beta-raid/econ/trade-journal";
import { stackItemKey } from "@/server/api/beta-raid/econ/trade-keys";
import type { ChestActor } from "@/server/api/beta-raid/chest/chest-row";

/** Вид товара для журнала: ключ стека и подпись. */
export type NoteItem = { stackKey: string; kind: string; refId: string | null; name: string };

/** Строки журнала: один вид — одна строка, ref — ключ нажатия с номером. */
export function plainNotes(
  a: ChestActor,
  at: { q: number; r: number },
  side: "put" | "take",
  moves: ReadonlyArray<{ item: NoteItem; qty: number; ref: string }>,
): TradeNote[] {
  return moves.map((m) => ({
    accountId: a.account,
    counterparty: null,
    mapId: a.mapId,
    q: at.q,
    r: at.r,
    source: "plain_chest",
    side,
    itemKey: stackItemKey(m.item.stackKey, m.item.kind, m.item.refId, m.item.name),
    itemName: m.item.name,
    qty: m.qty,
    ref: m.ref,
  }));
}

/** Положил или забрал одну позицию. */
export function notePlain(
  a: ChestActor,
  at: { q: number; r: number },
  side: "put" | "take",
  item: NoteItem,
  qty: number,
  ref: string,
): Promise<void> {
  return noteTrades(plainNotes(a, at, side, [{ item, qty, ref }]));
}
