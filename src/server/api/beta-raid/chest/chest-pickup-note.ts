// «Забрать сундук» (магический): рассылка и журнал сделок после записи.
//
// Сундук исчез у всех (слой карты перечитывается по 'built'), мешочек с
// остатком и бугорки рядом — по 'bags'. Журнал сделок (ПРАВИЛА §8.13): хозяин
// забрал своё — «забрал из сети», не влезшее — «положил в мешочек»; чужой —
// у хозяина «потерял» всё, что ушло (сундук и, у последнего, сеть), у
// снимающего — «унёс» то, что легло в рюкзак, и «положил в мешочек» остальное.
// Зовётся и на повторе того же нажатия: ответ первого прогона мог потеряться
// до рассылки, а ключи журнала повтор не задвоят. Best-effort: не бросает.
import { publishRaid } from "@/server/raidLive";
import type { ChestPickupResult, LootPick } from "@/lib/magicChest";
import { noteTrades, type TradeNote } from "@/server/api/beta-raid/econ/trade-journal";
import { stackItemKey } from "@/server/api/beta-raid/econ/trade-keys";
import {
  noteChestLoot,
  noteChestMove,
  noteChestSeize,
} from "@/server/api/beta-raid/econ/chest-note";
import type { ChestActor } from "@/server/api/beta-raid/chest/chest-row";

/** Позиция журнала нажатия: вид, подпись и сколько лежало (сундук — меткой chest). */
export type PickedItem = {
  stackKey: string;
  kind: string;
  refId: string | null;
  name: string;
  count: number | string;
  chest?: boolean;
  guard?: boolean;
};

type Place = { mapId: string; q: number; r: number };

/** «Положил в мешочек»: остаток ушёл на клетку, контрагент — кто поднимет. */
function bagNotes(a: ChestActor, at: Place, list: LootPick[], items: PickedItem[], ref: string) {
  const byKey = new Map(items.map((it) => [it.stackKey, it]));
  return list.flatMap((p, i): TradeNote[] => {
    const it = byKey.get(p.stackKey);
    if (!it) return [];
    const itemKey = stackItemKey(it.stackKey, it.kind, it.refId, it.name);
    return [
      {
        accountId: a.account,
        counterparty: null,
        ...at,
        source: "loot_bag",
        side: "put",
        itemKey,
        itemName: it.name,
        qty: p.qty,
        ref: `${ref}:b${i}`,
      },
    ];
  });
}

export function announcePickup(
  a: ChestActor,
  cell: { q: number; r: number },
  o: { op: string; owner: string; res: ChestPickupResult; items: PickedItem[] },
): void {
  const key = `${cell.q},${cell.r}`;
  publishRaid({ mapId: a.mapId, type: "built", cells: [key] });
  const bagged = o.res.bagged ?? [];
  if (bagged.length > 0 || o.res.chestBagged) {
    publishRaid({ mapId: a.mapId, type: "bags", cells: [key] });
    void import("@/server/api/beta-raid/loot-bag/bag-sweep").then((m) => m.startLootBagSweeper());
  }
  const at = { mapId: a.mapId, ...cell };
  const net = o.items.filter((it) => !it.chest && !it.guard);
  const chest = o.items.find((it) => it.chest);
  const toBag = [
    ...(o.res.chestBagged && chest ? [{ stackKey: chest.stackKey, qty: 1 }] : []),
    ...bagged,
  ];
  const notes = bagNotes(a, at, toBag, o.items, o.op);
  if (notes.length > 0) void noteTrades(notes);
  if (o.owner === a.account) {
    for (const [n, p] of o.res.taken.entries()) {
      const it = net.find((x) => x.stackKey === p.stackKey);
      if (!it) continue;
      const snap = { kind: it.kind, refId: it.refId, name: it.name };
      void noteChestMove({
        side: "take",
        account: a.account,
        ...at,
        stackKey: p.stackKey,
        snap,
        qty: p.qty,
        ref: `${o.op}:t${n}`,
      });
    }
    return;
  }
  // Чужой: у хозяина ушло всё снятое (сундук и сеть последнего), у снимающего —
  // что легло в рюкзак (сундук, если влез, и товары сети).
  const lost = [...(chest ? [chest] : []), ...net].map((it) => ({
    ...it,
    count: Number(it.count) || 0,
  }));
  const plunder = { ...at, plunderId: o.op, owner: o.owner, raider: a.account };
  void noteChestSeize({ ...plunder, items: lost });
  const got = [
    ...(chest && !o.res.chestBagged ? [{ stackKey: chest.stackKey, qty: 1 }] : []),
    ...o.res.taken,
  ];
  void noteChestLoot({ ...plunder, items: lost, taken: got });
}
