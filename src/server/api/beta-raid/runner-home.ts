// Воскрешение возвращает убегающих ДОМОЙ — туда, где их поставил админ.
//
// Беглец живёт не в клетке, а в своём слое (runners.ts) и за жизнь успевает
// уйти на десяток клеток от места, куда его ставили. Кнопка восстановления
// поднимала только объекты самих клеток, и после неё карта выглядела так:
// боссы и сундуки на местах, а грибы — где их застало последнее бегство, и
// притом мёртвые (их слой кнопка не видела вовсе).
//
// Здесь беглец возвращается на исходную клетку (`home_q, home_r`) и снова
// становится её объектом: та же строка, тот же конфиг, то же обеспечение
// Darai. Боевое состояние стирается — объект поднят целым, как и все
// остальные.
//
// Если дом за это время занял другой объект, беглец переезжает домой СЛОЕМ:
// встаёт под нового хозяина клетки, как он и прятался бы там сам. Возвращать
// его в чужую клетку нельзя — это стёрло бы то, что админ поставил после.
//
// Дом стал шахтой (или членом блока-шахты) — беглец остаётся, где был: на
// шахту не встают и под неё не прячутся (§8.59 п. 9, flee-sql.CAN_STAND_DRY).
// Так же для моба, чей дом — дорога или жила (владелец, 22.10.2026: «мобов на
// жилах и дорогах не спавнить», mob-ground): дом для него закрыт.
// Боевое состояние на месте стирается так же — он поднят целым, но не дома.
// Такой (и любой, кто остался на месте) считается в `parked`: иначе подъём
// павшего беглеца без иных правок не пересобрал бы карту (admin-restore).
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { CELL_LAYER, RUNNER_LAYER } from "./runners";
import { BOSS_TEMPLATE_JOIN } from "./restore-reward-sql";
import { POS_MAP_SQL } from "./pos-map-sql";
import { mineCellSql } from "@/server/api/beta-raid/mine-cell-sql";
import { mobGroundSql, mobIdSql } from "@/server/api/beta-raid/mob-ground";

export type RunnersHome = {
  /** Снова стали объектами своих клеток. */
  returned: number;
  /** Остались слоем и подняты целыми: переехали под нового хозяина дома
   *  или (дом — шахта / дома другой беглец) поднялись там, где стояли. */
  parked: number;
};

/**
 * Вернуть беглецов по домам.
 *
 * `kindFilter` и `resourceOk` — те же условия, что и у восстановления клеток,
 * но в терминах `rn` (строка беглеца), `t`/`bt` (шаблоны) и `h` (боевое
 * состояние слоя беглецов). Без них кнопка «восстановить монетки» тащила бы
 * домой ещё и боссов.
 */
export async function returnRunnersHome(opts: {
  mapId: string;
  kindFilter: string;
  resourceOk: string;
}): Promise<RunnersHome> {
  const m = sqlStr(opts.mapId);
  const rows = (await mcpExec(
    `WITH pick AS (
       SELECT rn.id, rn.q, rn.r, rn.object_id, rn.object_config,
              rn.darai_ref, rn.darai_hold, rn.home_q, rn.home_r,
              (hc.map_id IS NOT NULL AND hc.object_id IS NULL) AS home_free,
              COALESCE(hc.map_id IS NOT NULL AND ${mineCellSql("hc")}, false) AS home_mine,
              -- мобу дом на дороге или жиле закрыт так же, как шахта
              COALESCE(hc.map_id IS NOT NULL AND ${mobIdSql("rn.object_id")}
                AND NOT ${mobGroundSql("hc")}, false) AS home_road,
              (h.map_id IS NOT NULL) AS hurt
         FROM yuplink.beta_raid_runner rn
         LEFT JOIN yuplink.mystic_item_template t
                ON t.id = CASE WHEN rn.object_id LIKE '%:%'
                               THEN split_part(rn.object_id, ':', 2) ELSE rn.object_id END
         ${BOSS_TEMPLATE_JOIN("rn")}
         LEFT JOIN yuplink.beta_raid_object_hp h
                ON h.map_id = rn.map_id AND h.q = rn.q AND h.r = rn.r
               AND h.cycle_no = ${RUNNER_LAYER}
         LEFT JOIN yuplink.raid_map_cells hc
                ON hc.map_id = rn.map_id AND hc.q = rn.home_q AND hc.r = rn.home_r
        WHERE rn.map_id = ${m} AND (${opts.kindFilter}) AND (${opts.resourceOk})
          -- дома кто-то стоит: объект оживёт прямо под ногами и запрёт клетку
          AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                           WHERE p.q = rn.home_q AND p.r = rn.home_r
                             AND ${POS_MAP_SQL("p")} = rn.map_id)
     ),
     back AS (
       UPDATE yuplink.raid_map_cells c
          SET object_id = p.object_id, object_config = p.object_config,
              darai_ref = p.darai_ref, darai_hold = p.darai_hold, saved_at = now()
         FROM pick p
        WHERE c.map_id = ${m} AND c.q = p.home_q AND c.r = p.home_r
          AND NOT p.home_road AND p.home_free AND NOT p.home_mine AND c.object_id IS NULL
       RETURNING p.id, p.home_q, p.home_r
     ),
     -- боевое состояние стираем целиком: и то, что беглец накопил в бегах, и
     -- то, что могло осиротеть дома. Строки нет — значит объект целый, она
     -- заводится заново первым ударом (encounter-hp).
     hp_gone AS (
       DELETE FROM yuplink.beta_raid_object_hp h
        USING pick p
        WHERE h.map_id = ${m}
          AND ((h.q = p.q AND h.r = p.r AND h.cycle_no = ${RUNNER_LAYER})
            OR (h.q = p.home_q AND h.r = p.home_r AND h.cycle_no = ${RUNNER_LAYER}
                AND NOT p.home_mine AND NOT p.home_road)
            OR (h.q = p.home_q AND h.r = p.home_r AND h.cycle_no = ${CELL_LAYER}
                AND EXISTS (SELECT 1 FROM back b WHERE b.id = p.id)))
       RETURNING 1
     ),
     gone AS (
       DELETE FROM yuplink.beta_raid_runner rn
        USING back b WHERE rn.id = b.id
       RETURNING rn.id
     ),
     parked AS (
       UPDATE yuplink.beta_raid_runner rn
          SET q = p.home_q, r = p.home_r, moves = 0, moved_at = now()
         FROM pick p
        WHERE rn.id = p.id
          AND NOT EXISTS (SELECT 1 FROM back b WHERE b.id = p.id)
          AND NOT p.home_mine AND NOT p.home_road
          AND (p.q <> p.home_q OR p.r <> p.home_r)
          -- дома уже сидит другой беглец: слой держит одного на клетку
          AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_runner o
                           WHERE o.map_id = ${m} AND o.q = p.home_q AND o.r = p.home_r
                             AND o.id <> rn.id)
       RETURNING rn.id
     )
     SELECT (SELECT count(*)::int FROM gone) AS returned,
            (SELECT count(*)::int FROM parked)
            -- не сдвинулись, но боевое состояние стёрто — тоже перемена карты
            + (SELECT count(*)::int FROM pick p
                WHERE p.hurt
                  AND NOT EXISTS (SELECT 1 FROM back b WHERE b.id = p.id)
                  AND NOT EXISTS (SELECT 1 FROM parked x WHERE x.id = p.id)) AS parked;`,
    // Без обёртки в row_to_json: запрос сам начинается с WITH и меняет данные,
    // а такой WITH обязан быть верхним уровнем — обёртка ронял бы его целиком.
    { wrapJson: false },
  )) as Array<{ returned: number; parked: number }>;
  const row = rows?.[0];
  return { returned: Number(row?.returned) || 0, parked: Number(row?.parked) || 0 };
}
