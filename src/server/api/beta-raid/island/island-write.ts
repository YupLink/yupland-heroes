// Запись острова: карта-черновик (её не видит никто, кроме хозяина), клетки,
// тиры, город, мастерская с рецептами, закопанные клады, лодка, точки
// возрождения боссов и строка задания. Только тексты — исполняет island-create
// по порядку.
import { sqlStr } from "@/server/api/raid-shared";
import { cellsSql, insertMapSql, shopsSql, tiersSql, townsSql } from "../worldgen/write-sql";
import {
  ISLAND_ITEMS,
  ISLAND_LOOT,
  ISLAND_RECIPE_DAY_LIMIT,
  ISLAND_RECIPES,
  type Amount,
} from "@/lib/raid/island/catalog";
import { SHORT_AXE_GOLD } from "@/lib/raid/island/shortTutorial";
import { ISLAND_SELL } from "@/lib/raid/island/loot";
import { ISLAND_SIZE } from "@/lib/raid/island/shape";
import { isIslandMapId } from "@/lib/raid/island/ids";
import type { Island } from "@/lib/raid/island/generate";
import type { Cell } from "@/lib/raid/worldgen/geo";
import { bossSpawnsSql, buriedBagSql, digsSql } from "./island-extras";
import { storeSql } from "./island-stores";
import { splitStores } from "@/lib/raid/island/stores";
import { masterShopsSql } from "./island-master";
import { resBaseSql } from "./island-exit-cap";

const json = (v: unknown) => `${sqlStr(JSON.stringify(v))}::jsonb`;

/** Имя комнаты портала острова: куда он ведёт. */
const portalRoomSql = (mapId: string) =>
  `INSERT INTO yuplink.raid_portal_room (map_id, num, name, tpl, updated_at)
   VALUES (${sqlStr(mapId)}, 1, 'Основной мир', '{}'::jsonb, now())
   ON CONFLICT (map_id, num) DO NOTHING;`;

/** Цена рецепта колонками лавки: первая и вторая (алхимия — платят обеими). */
function priceCols(cost: readonly Amount[]): string {
  const [a, b] = cost;
  const one = (x: Amount | undefined) =>
    x ? `'custom', ${sqlStr(ISLAND_ITEMS[x.item])}, ${x.n}` : "NULL, NULL, NULL";
  return `${one(a)}, ${one(b)}`;
}

/** Мастерская: лавка без ратуши, её товары — инструменты за материалы. */
export function workshopSql(mapId: string, at: Cell, short = false): string[] {
  const m = sqlStr(mapId);
  const shop = `INSERT INTO yuplink.raid_market_shop (map_id, q, r, updated_at)
     VALUES (${m}, ${at.q}, ${at.r}, now()) ON CONFLICT (map_id, q, r) DO NOTHING;`;
  const items = ISLAND_RECIPES.map(
    (rc, pos) =>
      `INSERT INTO yuplink.raid_market_item
         (id, map_id, q, r, pos, kind, ref_id, give_amount, name, image,
          price_resource, price_token, price_amount,
          price2_resource, price2_token, price2_amount, side, per_account_limit)
       SELECT ${sqlStr(`${mapId}_${rc.id}`)}, ${m}, ${at.q}, ${at.r}, ${pos}, 'custom', ci.id, 1,
              ci.name, ci.image, ${short && rc.id === "axe" ? `'gold', NULL, ${SHORT_AXE_GOLD}, NULL, NULL, NULL` : priceCols(rc.cost)}, 'buy', ${ISLAND_RECIPE_DAY_LIMIT}
         FROM yuplink.raid_custom_item ci WHERE ci.id = ${sqlStr(ISLAND_ITEMS[rc.give])}
       ON CONFLICT (id) DO NOTHING;`,
  );
  // Скупка (20.10): камень, бревна и слитки из кладов и с карты — в ресурсы счёта
  // на починку шахт и портала. Мастерская без ратуши — платит своим ресурсом.
  const sells = ISLAND_SELL.map(
    (sl, k) =>
      `INSERT INTO yuplink.raid_market_item
         (id, map_id, q, r, pos, kind, ref_id, give_amount, name, image,
          price_resource, price_token, price_amount, side)
       SELECT ${sqlStr(`${mapId}_sell_${sl.item}`)}, ${m}, ${at.q}, ${at.r},
              ${ISLAND_RECIPES.length + k}, 'custom', ci.id, 1, ci.name, ci.image,
              ${sqlStr(sl.resource)}, NULL, ${sl.amount}, 'sell'
         FROM yuplink.raid_custom_item ci WHERE ci.id = ${sqlStr(ISLAND_ITEMS[sl.item])}
       ON CONFLICT (id) DO NOTHING;`,
  );
  return [shop, ...items, ...sells];
}

/**
 * id клада — в формате мешочков игры (`lb_` + md5): ручки мешочка (выкопать,
 * взять) пускают только такой. Прежний `lb_isle_…` отбивала проверка ввода.
 */
export const treasureIdSql = (mapId: string): string =>
  `'lb_' || md5(${sqlStr(`island:${mapId}`)})`;

/** Главный клад — у портала (ISLAND_LOOT.treasure). */
const treasureSql = (mapId: string, at: Cell, account: string): string[] =>
  buriedBagSql(treasureIdSql(mapId), mapId, at, account, ISLAND_LOOT.treasure);

export type IslandWrite = {
  mapId: string;
  name: string;
  account: string;
  seed: number;
  island: Island;
  by: string;
  /** Остров-образец: лавки и мастерская с товарами — копией с этой карты. */
  copyShopsFrom?: string;
  /** false — админ: без снимка ресурсов, значит без потолков выноса и накопления (§8.114). */
  capped?: boolean;
};

/** Всё об острове по порядку: карта, клетки, тиры, город, мастерская, клады, задание. */
export function islandSql(o: IslandWrite): string[] {
  return [...islandMapSql(o), islandRowSql(o)];
}

/** Карта острова без строки задания (демо-остров пишет свою строку — demo-island). */
export function islandMapSql(o: IslandWrite): string[] {
  const { mapId, island } = o;
  const p = island.places;
  const shops = splitStores(island.shops);
  return [
    insertMapSql({ id: mapId, name: o.name, size: ISLAND_SIZE }),
    ...cellsSql(mapId, island.cells),
    ...tiersSql(mapId, island.cells),
    ...townsSql(mapId, island.halls),
    // В каждом городе ближайшая к ратуше лавка — магазин острова (stores.ts).
    // У копии образца лавки, магазины и мастерская — с образца, как он есть.
    ...(o.copyShopsFrom
      ? masterShopsSql(o.copyShopsFrom, mapId)
      : [
          ...shopsSql(mapId, { shops: shops.rest }),
          ...shops.stores.flatMap((at, k) => storeSql(mapId, at, k)),
          ...workshopSql(mapId, p.workshop, !!p.lesson),
        ]),
    portalRoomSql(mapId),
    ...treasureSql(mapId, p.treasure, o.account),
    ...digsSql(mapId, p.digs, o.account, o.seed),
    ...bossSpawnsSql(mapId, p),
  ];
}

function islandRowSql(o: IslandWrite): string {
  const { mapId, island } = o;
  return (
    // Туман как в мире, клетки целей тоже под ним (владелец, 15.10: «карта
    // вся сразу доступна — игрок получит шок»; 16.10: «подсвечивать не объект,
    // а ячейку в темноте» — рамка цели рисуется на клиенте, islandGoal).
    // Строка без карты (остров снесли после выхода) уступает место новому
    // острову с чистого листа; строку с живой картой не трогаем — второй
    // одновременный «создать» увидит чужую карту и снесёт свою (island-create).
    // res_base — сколько ресурсов было на старте острова: от него на выходе считается
    // потолок выноса, а пока он есть — держится и потолок накопления (island-14, §8.114).
    // Админу — NULL: у него за время на острове идут доходы основного мира.
    `INSERT INTO yuplink.raid_island (account_id, map_id, seed, places, created_by, res_base)
     VALUES (${sqlStr(o.account)}, ${sqlStr(mapId)}, ${o.seed}, ${json(island.places)}, ${sqlStr(o.by)},
             ${o.capped === false ? "NULL" : resBaseSql(o.account)})
     ON CONFLICT (account_id) DO UPDATE
       SET map_id = EXCLUDED.map_id, seed = EXCLUDED.seed, places = EXCLUDED.places,
           created_by = EXCLUDED.created_by, created_at = now(), done = '[]'::jsonb,
           back_map = NULL, back_q = NULL, back_r = NULL, finished_at = NULL,
           res_base = EXCLUDED.res_base, exit_cut = NULL
       WHERE yuplink.raid_island.map_id IS NULL;`
  );
}

/**
 * Уборка после сноса карты: бои, точки возрождения, срубленное, шахта, туман,
 * мешочки, город, лавки — и ВСЁ, что игрок оставил на острове: склад, сундуки,
 * суда (и стартовую лодку), грядки, рыбалка (владелец, 14.10.2026: «что
 * оставил на острове — удаляется вместе с островом, что забрал с собой —
 * остаётся с тобой»; рюкзак едет с героем).
 */
export function dropIslandSql(mapId: string): string[] {
  // Предохранитель: сносится только карта острова — живой мир и этажи никогда.
  if (!isIslandMapId(mapId)) throw new Error("island.not_island");
  const m = sqlStr(mapId);
  const byMap = [
    // Точки возрождения боссов острова (простых): снесённый остров их не ждёт.
    "raid_mob_spawn",
    "beta_raid_building_state",
    "beta_raid_building_use",
    "beta_raid_fog",
    "beta_raid_fog_seen",
    "beta_raid_runner",
    "raid_decor_respawn",
    "raid_dig_hole",
    "raid_mine_state",
    "raid_mine_guard",
    // Журнал починок шахт острова (метка «уже чинили») — мусор без карты.
    "raid_mine_op",
    "raid_town_stock_move",
    "raid_town_stock",
    "raid_town",
    "raid_market_shop",
    "raid_map_journal",
    // Оставленное игроком на острове.
    "raid_plain_chest",
    "raid_magic_chest",
    "raid_warehouse_slot",
    "beta_raid_ship",
    "raid_field_worker",
    "raid_fishing",
  ];
  return [
    `DELETE FROM yuplink.raid_market_buyer
      WHERE item_id IN (SELECT id FROM yuplink.raid_market_item WHERE map_id = ${m});`,
    `DELETE FROM yuplink.raid_market_item WHERE map_id = ${m};`,
    `DELETE FROM yuplink.beta_raid_object_run
      WHERE hp_id IN (SELECT id FROM yuplink.beta_raid_object_hp WHERE map_id = ${m});`,
    `DELETE FROM yuplink.beta_raid_object_hp WHERE map_id = ${m};`,
    `DELETE FROM yuplink.raid_loot_bag_item
      WHERE bag_id IN (SELECT id FROM yuplink.raid_loot_bag WHERE map_id = ${m});`,
    `DELETE FROM yuplink.raid_loot_bag_op
      WHERE bag_id IN (SELECT id FROM yuplink.raid_loot_bag WHERE map_id = ${m});`,
    `DELETE FROM yuplink.raid_loot_bag WHERE map_id = ${m};`,
    `DELETE FROM yuplink.raid_plain_chest_slot
      WHERE chest_id IN (SELECT id FROM yuplink.raid_plain_chest WHERE map_id = ${m});`,
    `DELETE FROM yuplink.raid_plain_chest_op
      WHERE chest_id IN (SELECT id FROM yuplink.raid_plain_chest WHERE map_id = ${m});`,
    ...byMap.map((t) => `DELETE FROM yuplink.${t} WHERE map_id = ${m};`),
    // Журнал потерь шахт — только забранное: незабранное ждёт «Забрать» и без карты.
    `DELETE FROM yuplink.raid_mine_capture_log WHERE map_id = ${m} AND claimed_at IS NOT NULL;`,
  ];
}

/**
 * Первым — сама карта: каскадом уходят клетки, комната портала и строка
 * задания. Не вышло — остров цел целиком, а не выпотрошен наполовину.
 */
export const dropMapSql = (mapId: string): string => {
  if (!isIslandMapId(mapId)) throw new Error("island.not_island");
  return `DELETE FROM yuplink.raid_maps WHERE id = ${sqlStr(mapId)};`;
};
