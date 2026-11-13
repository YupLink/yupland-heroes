// Факты острова одним запросом: какие шаги задания уже сделаны на самом деле.
//
// Ничего не верим окну: сундук открыт — у его клетки убитый объект; топор
// сделан — в мастерской острова есть покупка рецепта; дуб срублен — клетка
// ждёт отрастания или стоит без декора; шахта — игрок чинил шахту острова
// (или лесопилка за ним — острова до 20.10); клад выкопан —
// мешочек больше не закопан; портал починен — тир клетки последний.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import {
  ISLAND_ARTIFACT,
  ISLAND_ITEMS,
  ISLAND_TRAINING_PACK,
  WEAK_BOSSES,
} from "@/lib/raid/island/catalog";
import { SHORT_AXE_GOLD } from "@/lib/raid/island/shortTutorial";
import { islandSpellReceiptTail } from "@/lib/raid/island/shortSpell";
import { treasureIdSql } from "./island-write";
import { startHeroPickedSql } from "./island-gift";
import { islandGiftRef } from "@/lib/raid/island/gift";
import { hexDist } from "@/lib/raid/zonegen/town/hex";
import type { IslandPlaces } from "@/lib/raid/island/steps";
import type { Cell } from "@/lib/raid/worldgen/geo";

/** Шаблон слизня задания (первый босс острова) — boss_id его наград в «Добыче». */
export const SLIME_TEMPLATE = WEAK_BOSSES[0].id.replace(/^boss:/, "");

const inCells = (a: string, cells: readonly Cell[]): string =>
  cells.length === 0
    ? "false"
    : `(${a}.q, ${a}.r) IN (${cells.map((c) => `(${Math.trunc(c.q)}, ${Math.trunc(c.r)})`).join(", ")})`;

export function factsSql(
  account: string,
  mapId: string,
  p: IslandPlaces,
  done: ReadonlySet<string> = new Set(),
  /** Обучение начато заново: «Герой в подарок» засчитывает сам выбор (markDone), не наличие героя. */
  replay = false,
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
      ${fact(
        "hero_pick",
        // Герой острова выбран — раз на аккаунт (island-gift, до 20.10 — подарком);
        // раса выбрана в меню входа — тоже (герой у новичка один, 06.11.2026).
        replay
          ? "false"
          : `(EXISTS (SELECT 1 FROM yuplink.user_game_item WHERE id = 'ugi_isle_' || md5(${acc}))
          OR EXISTS (SELECT 1 FROM yuplink.player_gift
                      WHERE source_ref = ${sqlStr(islandGiftRef(account, "hero"))})
          OR ${startHeroPickedSql(account)})`,
      )} AS hero_pick,
      ${fact("chest", killed([p.chest]))} AS chest,
      ${fact("sell", p.lesson ? `EXISTS (SELECT 1 FROM yuplink.trade_journal t
        WHERE t.account_id = ${acc} AND t.map_id = ${m} AND t.side = 'sell'
          AND t.item_key = ${sqlStr(`custom:${ISLAND_ITEMS.goldIngot}`)}
          AND t.price_cur = 'gold' AND t.total >= ${SHORT_AXE_GOLD})` : "false")} AS sell,
      ${fact("boat", p.lesson ? `EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s
        WHERE s.map_id = ${m} AND s.owner = ${acc})` : "false")} AS boat,
      ${fact("sail", p.lesson ? `EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s
        WHERE s.map_id = ${m} AND s.owner = ${acc}
          AND ${inCells("s", p.lesson.water.filter((c) => (p.lesson!.islet ?? [p.lesson!.shore]).some((land) => hexDist(c, land) <= 1)))})` : "false")} AS sail,
      ${fact("spell", p.lesson?.pillar ? `EXISTS (SELECT 1 FROM yuplink.hero_boost_op o
        JOIN yuplink.hero_instance h ON h.id = o.hero_id
        WHERE h.account_id = ${acc} AND left(o.source, 12) = 'spell_learn:'
          AND right(o.source, ${islandSpellReceiptTail(mapId, p.lesson.pillar.q, p.lesson.pillar.r).length}) = ${sqlStr(islandSpellReceiptTail(mapId, p.lesson.pillar.q, p.lesson.pillar.r))})` : "false")} AS spell,
      ${fact("axe", crafted(ISLAND_ITEMS.axe))} AS axe,
      ${fact("chop", cut(p.trees))} AS chop,
      ${fact("slime", killed(p.monsters))} AS slime,
      ${fact(
        "slime_loot",
        // Награда за слизня забрана из «Добычи» — с ЭТОЙ карты (id карты у
        // каждого острова свой: прежний остров не в счёт), босс — слизень.
        `EXISTS (SELECT 1 FROM yuplink.raid_reward w
                  WHERE w.location_id = ${m} AND w.account_id = ${acc}
                    AND w.boss_id = ${sqlStr(SLIME_TEMPLATE)} AND w.claimed_at IS NOT NULL)`,
      )} AS slime_loot,
      ${fact("pickaxe", crafted(ISLAND_ITEMS.pickaxe))} AS pickaxe,
      ${fact("crystal", cut(p.crystals))} AS crystal,
      ${fact(
        "mine",
        // Починка остаётся в журнале и после поломки шахты (raid_mine_op).
        `(EXISTS (SELECT 1 FROM yuplink.raid_mine_op o
                   WHERE o.kind = 'repair' AND o.map_id = ${m} AND o.account_id = ${acc})
          OR EXISTS (SELECT 1 FROM yuplink.raid_mine_state s
                      WHERE s.map_id = ${m} AND s.q = ${p.mine.q} AND s.r = ${p.mine.r}
                        AND s.owner_account = ${acc}))`,
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
  replay = false,
): Promise<{ done: string[]; onIsland: boolean; at: Cell | null }> {
  const sql = factsSql(account, mapId, p, done, replay);
  const rows = (await mcpExec(sql, { wrapJson: true })) as FactRow[];
  const f = rows?.[0];
  if (!f) return { done: [], onIsland: false, at: null };
  const onIsland = f.pos_map === mapId;
  const at = onIsland ? { q: Number(f.pos_q), r: Number(f.pos_r) } : null;
  const yes = (k: string) => f[k] === true || f[k] === "t";
  const flags: string[] = [
    "hero_pick",
    "chest",
    "sell",
    "boat",
    "sail",
    "spell",
    "axe",
    "chop",
    "slime",
    "slime_loot",
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
  // Уже продал слиток сам — не заставляем искать его снова в рюкзаке.
  if (p.lesson && yes("sell")) found.push("chest_backpack");
  // «Дойди до сундука»: стоишь рядом или сундук уже открыт.
  if (yes("chest") || (at && hexDist(at, p.chest) <= 1)) found.push("walk");
  return { done: found, onIsland, at };
}
