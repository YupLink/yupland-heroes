// Журнал сделок для магического сундука: вклад, забор и грабёж.
//
// Своё в свою сеть — не сделка, но сеть копит только собранное, и без
// строк журнала панель «$ Экономика» не видела бы, где эта добыча лежит и
// куда уехала при грабеже. Грабёж — переход товара от игрока к игроку в два
// шага (вторая редакция, 27.09.2026): в миг победы «потерял» у владельца
// (всё, что ушло в добычу, вместе с сундуком), при выборе — «унёс» у
// победителя; контрагент — другая сторона, ключи — от id добычи.
//
// Best-effort, как весь журнал (§8.13): ничего не бросает, сундук не ломает.
import { noteTrades, type TradeNote } from "@/server/api/beta-raid/econ/trade-journal";
import { stackItemKey } from "@/server/api/beta-raid/econ/trade-keys";

type Snap = { kind: string; refId: string | null; name: string };
type Place = { mapId: string; q: number; r: number };

/**
 * Положил в сеть (put) или забрал из неё (take). Без цены; контрагент — хозяин
 * сети, когда кладёт чужой (30.09), иначе без него.
 */
export function noteChestMove(
  o: Place & {
    side: "put" | "take";
    account: string;
    counterparty?: string | null;
    stackKey: string;
    snap: Snap;
    qty: number;
    ref: string;
  },
): Promise<void> {
  try {
    return noteTrades([
      {
        accountId: o.account,
        counterparty: o.counterparty ?? null,
        mapId: o.mapId,
        q: o.q,
        r: o.r,
        source: "chest",
        side: o.side,
        itemKey: stackItemKey(o.stackKey, o.snap.kind, o.snap.refId, o.snap.name),
        itemName: o.snap.name,
        qty: o.qty,
        ref: o.ref,
      },
    ]);
  } catch (e) {
    console.warn("trade-journal", "chest", e instanceof Error ? e.message : String(e));
    return Promise.resolve();
  }
}

type PlunderPlace = Place & { plunderId: string; owner: string; raider: string };
type PlunderSnap = Snap & { stackKey: string };
const keyOf = (it: PlunderSnap) => stackItemKey(it.stackKey, it.kind, it.refId, it.name);

/**
 * Захват (победа над охраной): у владельца — всё, что ушло в добычу, side
 * 'pay', контрагент — победитель. Сеть пустеет целиком в этот же миг,
 * независимо от того, что победитель потом выберет.
 */
export function noteChestSeize(
  o: PlunderPlace & { items: ReadonlyArray<PlunderSnap & { count: number }> },
): Promise<void> {
  try {
    return noteTrades(
      o.items.map((it, i) => ({
        mapId: o.mapId,
        q: o.q,
        r: o.r,
        source: "chest_plunder" as const,
        accountId: o.owner,
        counterparty: o.raider,
        side: "pay" as const,
        itemKey: keyOf(it),
        itemName: it.name,
        qty: it.count,
        ref: `${o.plunderId}:o${i}`,
      })),
    );
  } catch (e) {
    console.warn("trade-journal", "chest_plunder", e instanceof Error ? e.message : String(e));
    return Promise.resolve();
  }
}

/** Выбор добычи: у победителя — что реально уехало в рюкзак (side 'take'). */
export function noteChestLoot(
  o: PlunderPlace & {
    items: ReadonlyArray<PlunderSnap>;
    taken: ReadonlyArray<{ stackKey: string; qty: number }>;
  },
): Promise<void> {
  try {
    const byKey = new Map(o.items.map((it) => [it.stackKey, it]));
    const got: TradeNote[] = o.taken.flatMap((t, i) => {
      const it = byKey.get(t.stackKey);
      if (!it) return [];
      return [
        {
          mapId: o.mapId,
          q: o.q,
          r: o.r,
          source: "chest_plunder" as const,
          accountId: o.raider,
          counterparty: o.owner,
          side: "take" as const,
          itemKey: keyOf(it),
          itemName: it.name,
          qty: t.qty,
          ref: `${o.plunderId}:r${i}`,
        },
      ];
    });
    return noteTrades(got);
  } catch (e) {
    console.warn("trade-journal", "chest_plunder", e instanceof Error ? e.message : String(e));
    return Promise.resolve();
  }
}
