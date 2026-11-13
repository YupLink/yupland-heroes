// Рыба под красным динамитом (владелец, 30.10.2026; lib/raid/dynamiteFish): какие
// клетки взрыва — вода (то же правило, что у берега удочки, WATER_SQL), бросок шанса
// удочки на каждой и что всплыло — вход функции базы (p_fish, dynamite-07). Мешочек
// кладёт база — под локами броска и только на воде красного взрыва.
//
// Всё решает сервер: шанс — настройка рыбалки мира с бонусом героя и погодой карты
// (как заброс), бросок — от зерна броска на серверном секрете (fishing-seed, соль
// «dynamite»): ключ нажатия из браузера сам по себе исхода не выдаёт, а повтор того
// же нажатия бросает то же самое. Улов настроен пусто или рыбалка закрыта — рыбы нет,
// взрыв идёт как обычно. Башмак (isBootName) всплывает рыбой, внутри — метка.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { FISHING_ADMIN_ONLY } from "@/lib/featureGates";
import { blastCells, type DynamiteKind } from "@/lib/dynamite";
import {
  FISH_BAG_SOURCE_NAME,
  dynamiteFishChance,
  isBootName,
  rollBlastFish,
} from "@/lib/raid/dynamiteFish";
import { fishSeed } from "@/server/api/beta-raid/fishing/fishing-seed";
import { groupItems } from "@/server/api/beta-raid/loot-bag/bag-deliver-parts";
import {
  blastItemsOf,
  bootItem,
  type BlastFishIn,
  type BlastItem,
} from "@/server/api/beta-raid/dynamite/dynamite-bag-items";

type Hex = { q: number; r: number };

/** Соль зерна: бросок динамита не совпадает с забросом удочки того же ключа. */
export const DYNAMITE_FISH_SALT = "dynamite";

/** Клетки воды среди семи клеток красного взрыва (без купола — его отсеет и база). */
export const blastWaterSql = (mapId: string, at: Hex): string => {
  const list = blastCells(at, "red")
    .map((c) => `(${Math.trunc(c.q)}, ${Math.trunc(c.r)})`)
    .join(", ");
  return `SELECT c.q, c.r
       FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE c.map_id = ${sqlStr(mapId)} AND (c.q, c.r) IN (${list})
        AND NOT COALESCE(c.void_fog, false) AND ${WATER_SQL};`;
};

/** Шанс клетки — шанс заброса удочкой этого героя сейчас: база, бонус героя, погода. */
async function chanceNow(mapId: string, wallet: string, basePct: number): Promise<number> {
  const [{ fishBonusOf }, { mapWeatherCoefs }] = await Promise.all([
    import("@/server/api/beta-raid/fishing/fishing-bonus"),
    import("@/server/api/beta-raid/weather/weather-read"),
  ]);
  const [bonus, coefs] = await Promise.all([fishBonusOf(wallet), mapWeatherCoefs(mapId)]);
  return dynamiteFishChance(basePct + bonus.addPct, bonus.bonusPct, coefs.fish);
}

/** Порции всплывшей рыбы: товар улова с меткой «собрано» (как у удочки) или метка башмака. */
export async function fishItems(itemId: string): Promise<BlastItem[]> {
  const { groups } = await groupItems([{ itemId, amount: 1, origin: "loot" }]);
  const items = blastItemsOf(groups);
  return items.some((i) => isBootName(i.name)) ? [bootItem()] : items;
}

/** Рыба под взрывом — вход функции базы. Синий и суша — пусто. */
export async function blastFish(o: {
  mapId: string;
  at: Hex;
  kind: DynamiteKind;
  account: string;
  wallet: string;
  /** Ключ нажатия броска (dyn:<аккаунт>:<op>) — от него зерно. */
  op: string;
}): Promise<BlastFishIn[]> {
  if (o.kind !== "red") return [];
  const rows = ((await mcpExec(blastWaterSql(o.mapId, o.at), { wrapJson: true })) ?? []) as Array<{
    q: number | string;
    r: number | string;
  }>;
  if (rows.length === 0) return [];
  if (FISHING_ADMIN_ONLY) {
    const { isAdminWallet } = await import("@/server/auth");
    if (!isAdminWallet(o.wallet)) return [];
  }
  const { loadFishingConfig } = await import("@/server/api/beta-raid/fishing/fishing-config");
  const cfg = await loadFishingConfig();
  if (cfg.items.length === 0) return [];
  const water = new Set(rows.map((x) => `${Number(x.q)},${Number(x.r)}`));
  const rolls = rollBlastFish({
    seed: fishSeed(o.account, o.op, DYNAMITE_FISH_SALT),
    at: o.at,
    isWater: (c) => water.has(`${c.q},${c.r}`),
    chancePct: await chanceNow(o.mapId, o.wallet, cfg.chancePct),
    items: cfg.items,
  });
  const out: BlastFishIn[] = [];
  for (const f of rolls) {
    const items = await fishItems(f.itemId);
    if (items.length > 0) out.push({ q: f.q, r: f.r, nm: FISH_BAG_SOURCE_NAME, items });
  }
  return out;
}
