// Факты острова одним запросом: какие шаги задания уже сделаны на самом деле.
//
// Ничего не верим окну: сундук открыт — у его клетки убитый объект; топор
// сделан — в мастерской острова есть покупка рецепта; дуб срублен — клетка
// ждёт отрастания или стоит без декора; шахта — за игроком; клад выкопан —
// мешочек больше не закопан; портал починен — тир клетки последний.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { ISLAND_ARTIFACT, ISLAND_ITEMS, ISLAND_TRAINING_PACK } from "@/lib/raid/island/catalog";
import { treasureIdSql } from "./island-write";
import { hexDist } from "@/lib/raid/zonegen/town/hex";
import type { IslandPlaces } from "@/lib/raid/island/steps";
import type { Cell } from "@/lib/raid/worldgen/geo";

const inCells = (a: string, cells: readonly Cell[]): string =>
  cells.length === 0
    ? "false"
    : `(${a}.q, ${a}.r) IN (${cells.map((c) => `(${Math.trunc(c.q)}, ${Math.trunc(c.r)})`).join(", ")})`;

export function factsSql(
  account: string,
  mapId: string,
  p: IslandPlaces,
  done: ReadonlySet<string> = new Set(),
): string {
  const [acc, m] = [sqlStr(account), sqlStr(mapId)];
  // Засчитанное не откатывается — его и не проверяем: опрос раз в 4 с, а
  // проверка пака (chip_pack_grants) стоила 21 мс перебора (14.10).
  const fact = (id: string, sql: string) => (done.has(id) ? "true" : sql);
  // Убитый объект уборка (dead-sweep) через 5 с снимает с клетки вместе со
  // строкой HP: пустая клетка, где он стоял, — тоже «убит».
  const killed = (cells: readonly Cell[]) =>
    `(EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
               WHERE h.map_id = ${m} AND ${inCells("h", cells)}
                 AND (h.killed_at IS NOT NULL OR h.current_hp <= 0))
      OR EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
                  WHERE c.map_id = ${m} AND ${inCells("c", cells)} AND c.object_id IS NULL))`;
  const crafted = (item: string) =>
    `EXISTS (SELECT 1 FROM yuplink.raid_market_buyer b
               JOIN yuplink.raid_market_item i ON i.id = b.item_id
              WHERE i.map_id = ${m} AND i.ref_id = ${sqlStr(item)}
                AND b.account_id = ${acc} AND b.bought > 0)`;
  // Награды считаем с ЭТОГО острова: у прошедших остров раньше (админы) уже
  // есть «Топор» и открытый пак — шаги «забери/надень» иначе проскакивали
  // (владелец, 16.10: «не было инструкции, как забрать добычу»).
  const since = `(SELECT created_at FROM yuplink.raid_island WHERE account_id = ${acc})`;
  const cut = (cells: readonly Cell[]) =>
    `(EXISTS (SELECT 1 FROM yuplink.raid_decor_respawn d
               WHERE d.map_id = ${m} AND ${inCells("d", cells)})
      OR EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
                  WHERE c.map_id = ${m} AND ${inCells("c", cells)} AND c.decoration_id IS NULL))`;
  return `SELECT
      (SELECT map_id FROM yuplink.beta_raid_positions WHERE account_id = ${acc}) AS pos_map,
      (SELECT q FROM yuplink.beta_raid_positions WHERE account_id = ${acc}) AS pos_q,
      (SELECT r FROM yuplink.beta_raid_positions WHERE account_id = ${acc}) AS pos_r,
      ${fact("chest", killed([p.chest]))} AS chest,
      ${fact("axe", crafted(ISLAND_ITEMS.axe))} AS axe,
      ${fact("chop", cut(p.trees))} AS chop,
      ${fact("slime", killed(p.monsters))} AS slime,
      ${fact("pickaxe", crafted(ISLAND_ITEMS.pickaxe))} AS pickaxe,
      ${fact("crystal", cut(p.crystals))} AS crystal,
      ${fact(
        "mine",
        `EXISTS (SELECT 1 FROM yuplink.raid_mine_state s
                  WHERE s.map_id = ${m} AND s.q = ${p.mine.q} AND s.r = ${p.mine.r}
                    AND s.owner_account = ${acc})`,
      )} AS mine,
      ${fact("shovel", crafted(ISLAND_ITEMS.shovel))} AS shovel,
      ${fact(
        "dig",
        `NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag b
                      WHERE b.id = ${treasureIdSql(mapId)} AND b.buried_at IS NOT NULL)`,
      )} AS dig,
      ${fact(
        "portal",
        `EXISTS (SELECT 1 FROM yuplink.beta_raid_building_state s
                  WHERE s.map_id = ${m} AND s.q = ${p.portal.q} AND s.r = ${p.portal.r}
                    AND s.tier >= 1)`,
      )} AS portal,
      ${fact("x_artifact", p.artifact ? killed([p.artifact]) : "false")} AS x_artifact,
      ${fact(
        "art_take",
        // Артефакт забран из «Добычи» — лежит у аккаунта.
        `EXISTS (SELECT 1 FROM yuplink.user_game_item u
                  WHERE u.account_id = ${acc} AND u.template_id = ${sqlStr(ISLAND_ARTIFACT)}
                    AND u.obtained_at >= ${since})`,
      )} AS art_take,
      ${fact(
        "equip",
        // Артефакт острова надет на героя аккаунта (снаряжение: слот → предмет).
        `EXISTS (SELECT 1 FROM yuplink.hero_instance h
                  CROSS JOIN LATERAL jsonb_each_text(COALESCE(h.equipped, '{}'::jsonb)) e
                  JOIN yuplink.user_game_item u ON u.id = e.value
                  WHERE h.account_id = ${acc} AND u.template_id = ${sqlStr(ISLAND_ARTIFACT)}
                    AND u.obtained_at >= ${since})`,
      )} AS equip,
      ${fact("pack_boss", p.pack ? killed([p.pack]) : "false")} AS pack_boss,
      ${fact(
        "pack_got",
        `EXISTS (SELECT 1 FROM yuplink.chip_pack_grants g
                  WHERE g.account_id = ${acc}
                    AND g.chip_pack_id = ${sqlStr(ISLAND_TRAINING_PACK)}
                    AND g.granted_at >= ${since})`,
      )} AS pack_got,
      ${fact(
        "x_pack",
        `EXISTS (SELECT 1 FROM yuplink.chip_pack_grants g
                  WHERE g.account_id = ${acc}
                    AND g.chip_pack_id = ${sqlStr(ISLAND_TRAINING_PACK)}
                    AND g.granted_at >= ${since}
                    AND g.opened_at IS NOT NULL)`,
      )} AS x_pack;`;
}

type FactRow = Record<string, unknown> & { pos_map: string | null; pos_q: unknown; pos_r: unknown };

/** Шаги, сделанные по фактам карты, и где сейчас стоит игрок. */
export async function islandFacts(
  account: string,
  mapId: string,
  p: IslandPlaces,
  done: ReadonlySet<string> = new Set(),
): Promise<{ done: string[]; onIsland: boolean; at: Cell | null }> {
  const sql = factsSql(account, mapId, p, done);
  const rows = (await mcpExec(sql, { wrapJson: true })) as FactRow[];
  const f = rows?.[0];
  if (!f) return { done: [], onIsland: false, at: null };
  const onIsland = f.pos_map === mapId;
  const at = onIsland ? { q: Number(f.pos_q), r: Number(f.pos_r) } : null;
  const yes = (k: string) => f[k] === true || f[k] === "t";
  const flags: string[] = [
    "chest",
    "axe",
    "chop",
    "slime",
    "pickaxe",
    "crystal",
    "mine",
    "shovel",
    "dig",
    "portal",
    "x_artifact",
    "art_take",
    "equip",
    "pack_boss",
    "pack_got",
    "x_pack",
  ];
  const found = flags.filter(yes);
  // «Дойди до сундука»: стоишь рядом или сундук уже открыт.
  if (yes("chest") || (at && hexDist(at, p.chest) <= 1)) found.push("walk");
  return { done: found, onIsland, at };
}
