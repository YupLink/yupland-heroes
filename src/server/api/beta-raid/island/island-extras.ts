// Что ещё ложится на остров при создании (владелец, 17.10.2026: «чуть
// территория побольше, чтобы человек поисследовал, ресурсы со временем
// спавнились»): клады-мешочки и точки возрождения простых боссов. Лодки нет —
// корабль игрок строит сам на верфи острова (владелец, 17.10.2026). Только тексты — исполняет island-create по порядку, ПОСЛЕ клеток:
// точка возрождения берёт босса и его настройку с клетки.
import { sqlStr } from "@/server/api/raid-shared";
import { ISLAND_BOSS_RESPAWN_MIN, ISLAND_ITEMS, type Amount } from "@/lib/raid/island/catalog";
import { digLoot } from "@/lib/raid/island/loot";
import { plainBosses } from "@/lib/raid/island/features";
import type { IslandPlaces } from "@/lib/raid/island/steps";
import type { Cell } from "@/lib/raid/worldgen/geo";

/** Клад не сгорает, пока остров живёт (обычный мешочек — сутки). */
const TREASURE_TTL = "now() + interval '90 days'";

/**
 * Мешочек «Клад», закопанный «самим игроком»: бугорок видно на разведанной
 * клетке, выкапывают лопатой (bag-dig). id — SQL-выражение в формате ручек
 * мешочка (`lb_` + md5), иначе проверка ввода не пустит его выкопать.
 */
export function buriedBagSql(
  id: string,
  mapId: string,
  at: Cell,
  account: string,
  loot: readonly Amount[],
): string[] {
  const acc = sqlStr(account);
  const bag = `INSERT INTO yuplink.raid_loot_bag
       (id, map_id, q, r, created_at, buried_at, buried_by, dropped_by, source, source_name, updated_at)
     VALUES (${id}, ${sqlStr(mapId)}, ${at.q}, ${at.r}, now(), now(), ${acc}, ${acc},
             'object', 'Клад', now())
     ON CONFLICT (id) DO NOTHING;`;
  const items = loot.map(
    (a) =>
      `INSERT INTO yuplink.raid_loot_bag_item
         (bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count,
          mob_count, mine_count, field_count, loot_count)
       SELECT ${id}, 'custom:' || ci.id, ${TREASURE_TTL}, 'custom', ci.id, ci.id, ci.name,
              ci.image, ${a.n}, 0, 0, 0, ${a.n}
         FROM yuplink.raid_custom_item ci WHERE ci.id = ${sqlStr(ISLAND_ITEMS[a.item])}
       ON CONFLICT DO NOTHING;`,
  );
  return [bag, ...items];
}

/** id прочих кладов: номер от 1 (главный клад — без номера, treasureIdSql). */
export const digIdSql = (mapId: string, n: number): string =>
  `'lb_' || md5(${sqlStr(`island:${mapId}:${n}`)})`;

/** Прочие клады: начинка по таблице кладов с диапазонами (loot.ts, от сида). */
export function digsSql(
  mapId: string,
  digs: readonly Cell[],
  account: string,
  seed: number,
): string[] {
  return digs.flatMap((at, i) =>
    buriedBagSql(digIdSql(mapId, i + 1), mapId, at, account, digLoot(i, seed)),
  );
}

/**
 * Точки возрождения (§8.49) — только простым боссам: возрождение копирует
 * награду клетки, артефакт и пак выпадали бы снова. Не бродят (roam 0):
 * «Показать» ведёт на ту же клетку.
 */
export function bossSpawnsSql(mapId: string, p: IslandPlaces): string[] {
  const plain = plainBosses(p);
  if (plain.length === 0) return [];
  const at = plain.map((c) => `(${Math.trunc(c.q)}, ${Math.trunc(c.r)})`).join(", ");
  return [
    `INSERT INTO yuplink.raid_mob_spawn
       (id, map_id, home_q, home_r, object_id, object_config, respawn_min, roam, step_min,
        cur_q, cur_r, next_step_at)
     SELECT 'msp_' || c.map_id || '_' || c.q || '_' || c.r, c.map_id, c.q, c.r,
            c.object_id, c.object_config, ${ISLAND_BOSS_RESPAWN_MIN}, 0, 5, c.q, c.r, now()
       FROM yuplink.raid_map_cells c
      WHERE c.map_id = ${sqlStr(mapId)} AND (c.q, c.r) IN (${at}) AND c.object_id LIKE 'boss:%'
     ON CONFLICT DO NOTHING;`,
  ];
}
