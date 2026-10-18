// Улов (ПРАВИЛА §8.35) — по общему правилу добычи с карты (§8.21, bag-deliver):
// в рюкзак выбранного героя, что не влезло — мешочком на клетке рыбака. Выдача
// не состоялась вовсе (сбой базы) — всё в «Добычу», как у объектов карты:
// пойманное (захват уже записан, износ снят) не пропадает. Метка — «собрано»
// (loot, §8.18): улов годится в магический сундук.
//
// Ключ выпадения — рыбалка и номер первой поимки захвата: захват поимок
// единственный (CAS по счётчику), поэтому и выдача у ключа одна — повтор моста
// второй раз не положит ни в рюкзак, ни мешочком, ни строкой «Добычи».
// Выданное — в журнал сделок и в турнир рыбаков (fishing-note) тем же ключом
// и со временем поимок.
import type { FishCatch } from "@/lib/raid/fishing";
import type { DropItem, DropResult } from "@/server/api/beta-raid/loot-bag/bag-deliver";
import { noteCatch } from "@/server/api/beta-raid/fishing/fishing-note";

export type CatchDrop = {
  wallet: string;
  account: string;
  mapId: string;
  q: number;
  r: number;
  /** Ключ выпадения: `fish:<аккаунт>:<рыбалка>:<первая поимка>`. */
  key: string;
  /** Имя удочки — подпись источника у мешочка и в «Добыче». */
  rodName: string;
  /** Товар → штук. */
  items: Map<string, number>;
  /** Когда поймана каждая рыба (мс, время попытки) — в журнал и турнир «Улов». */
  times?: readonly number[];
};

/** Ключ выпадения поимок рыбалки sid, начиная с номера from. */
export const catchKey = (account: string, sid: string, from: number): string =>
  `fish:${account}:${sid}:${from}`;

/** Выдать улов; ответ — что поймано (имя и картинка товара) для тоста. */
export async function deliverCatch(o: CatchDrop): Promise<FishCatch[]> {
  const [{ deliverOrDrop, queueKey }, { queueEncounterReward }, { canonCustomMeta }] =
    await Promise.all([
      import("@/server/api/beta-raid/loot-bag/bag-deliver"),
      import("@/server/api/beta-raid/reward-queue"),
      import("@/server/api/beta-raid/item-alias"),
    ]);
  const items: DropItem[] = [...o.items].map(([itemId, n]) => ({
    itemId,
    amount: n,
    origin: "loot",
  }));
  if (items.length === 0) return [];
  const toQueue = (it: DropItem, key: string) =>
    queueEncounterReward({
      account: o.account,
      mapId: o.mapId,
      cycleNo: 0,
      sourceName: o.rodName,
      kind: "custom",
      amount: it.amount,
      packId: it.itemId,
      origin: "loot",
      key,
    });
  let res: DropResult | null = null;
  try {
    res = await deliverOrDrop({
      owner: o.wallet,
      account: o.account,
      items,
      at: { key: o.key, mapId: o.mapId, q: o.q, r: o.r, source: "fish", sourceName: o.rodName },
      toQueue,
    });
  } catch (e) {
    // Ничего не выдано (сбой до первой записи) — в «Добычу» теми же ключами строк.
    console.warn("[fishing] улов — в «Добычу»:", o.key, e instanceof Error ? e.message : e);
    for (const [i, it] of items.entries()) {
      await toQueue(it, queueKey(o.key, i)).catch((err: unknown) =>
        console.error("[fishing] улов не встал в «Добычу»:", o.key, it.itemId, err),
      );
    }
  }
  const got: FishCatch[] = await Promise.all(
    items.map(async (it) => {
      const meta = await canonCustomMeta(it.itemId).catch(() => null);
      return {
        itemId: it.itemId,
        name: meta?.name ?? "",
        image: meta?.image ?? null,
        n: it.amount,
      };
    }),
  );
  // Мешочком — что упало у рыбака; остальное (рюкзак, «Добыча») — на счёт.
  const dropped = (id: string): number =>
    (res?.items ?? []).filter((x) => x.itemId === id).reduce((s, x) => s + x.dropped, 0);
  await noteCatch({
    account: o.account,
    mapId: o.mapId,
    q: o.q,
    r: o.r,
    key: o.key,
    times: o.times,
    items: got.map((g) => ({ itemId: g.itemId, name: g.name, n: g.n, dropped: dropped(g.itemId) })),
  });
  return got;
}
