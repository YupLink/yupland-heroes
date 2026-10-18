// Товар срубленного декора (decor-interact, шаг 4): в рюкзак выбранного героя,
// что не влезло — мешочком на клетке декора (владелец, 29.09.2026; ПРАВИЛА
// §8.21, loot-bag/bag-deliver.ts). Вынесено из decor-interact ради лимита
// ≤250 строк.
//
// strict: ничего не выдано (сбой базы, мешочек не упал) — бросок, и рубка
// откатывает энергию, инструмент и декор. Товар пропал из справочника или
// мешочек точно не упал после выданного — остаток ждёт в «Добыче».
import { nanoid } from "nanoid";

export async function giveDecorItem(o: {
  wallet: string;
  mapId: string;
  q: number;
  r: number;
  decorId: string;
  itemId: string;
  /** Имя декора — подпись источника у мешочка и в «Добыче». */
  name: string;
  amount: number;
}): Promise<{ dropped: number; queued: number }> {
  const [{ raidOwner }, { queueEncounterReward }, { deliverOrDrop }] = await Promise.all([
    import("@/server/api/beta-raid/owner"),
    import("@/server/api/beta-raid/reward-queue"),
    import("@/server/api/beta-raid/loot-bag/bag-deliver"),
  ]);
  const { mapId, q, r } = o;
  const account = await raidOwner(o.wallet);
  // Срубленное — собранное (ПРАВИЛА §8.18): годится в магический сундук.
  const got = await deliverOrDrop({
    owner: o.wallet,
    account,
    items: [{ itemId: o.itemId, amount: o.amount, origin: "loot" }],
    at: { key: `decor:${mapId}:${q}:${r}:${nanoid(12)}`, mapId, q, r, source: "decor", sourceName: o.name },
    strict: true,
    toQueue: (it, key) =>
      queueEncounterReward({
        account,
        mapId,
        cycleNo: 0,
        sourceName: o.name,
        targetId: o.decorId,
        kind: "custom",
        amount: it.amount,
        packId: it.itemId,
        origin: "loot",
        key,
      }),
  });
  const sum = (k: "dropped" | "queued") => got.items.reduce((n, it) => n + it[k], 0);
  return { dropped: sum("dropped"), queued: sum("queued") };
}
