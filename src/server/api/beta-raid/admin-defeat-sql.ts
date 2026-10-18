// «Погасить» объект на клетке — один SQL на все админские пути.
//
// Строка о смерти пишется с ПОЛНЫМ запасом объекта, а не с нулём. Массовая
// кнопка «Восстановить» (admin-restore) поднимает объекты как
// `current_hp = max_hp`: ноль в запасе означал бы «поднят к нулю HP», то есть
// добыт навсегда, и объект уже ничем не оживить.
import { nanoid } from "nanoid";
import { sqlStr } from "../raid-shared";
import { DEFAULT_MAX_HP } from "./encounter-target";

/** id объекта без префикса вида `boss:` — так его пишет бой (ensureObjectHp). */
export const BARE_OBJECT_ID = `CASE WHEN c.object_id LIKE '%:%'
                                    THEN split_part(c.object_id, ':', 2) ELSE c.object_id END`;

/**
 * Запас HP объекта — тем же порядком, что и бой (loadEncounterTarget +
 * applyCellOverride): настройки клетки → шаблон босса → СНИМОК удалённого
 * шаблона → шаблон предмета → эталон. `jsonb_typeof` обязателен: вписанная
 * руками строка вместо числа иначе роняла бы приведением типа весь пакет
 * выгрузки целиком.
 */
const MAX_HP = `GREATEST(1, COALESCE(
        NULLIF(CASE WHEN jsonb_typeof(c.object_config->'maxHp') = 'number'
                    THEN (c.object_config->>'maxHp')::numeric END, 0),
        NULLIF(bt.max_hp, 0),
        NULLIF(CASE WHEN jsonb_typeof(c.object_config->'tpl'->'maxHp') = 'number'
                    THEN (c.object_config->'tpl'->>'maxHp')::numeric END, 0),
        NULLIF(CASE WHEN jsonb_typeof(t.meta->'maxHp') = 'number'
                    THEN (t.meta->>'maxHp')::numeric END, 0),
        ${DEFAULT_MAX_HP}))::bigint`;

/**
 * Отметить объект клетки добытым. И сам объект, и его запас берутся ИЗ КЛЕТКИ,
 * поэтому в пакете правок этот оператор идёт после апсерта слоёв — там уже
 * стоит новый объект. Клетка без объекта не даёт ни строки: гасить нечего.
 *
 * id и object_id — NOT NULL: без них вставка падала, а объект оставался живым.
 */
export function defeatObjectSql(mapId: string, q: number, r: number): string {
  return `INSERT INTO yuplink.beta_raid_object_hp AS hp
       (id, map_id, q, r, object_id, cycle_no, max_hp, current_hp, killed_at, created_at, updated_at)
     SELECT ${sqlStr(`brh_${nanoid(10)}`)}, c.map_id, c.q, c.r, ${BARE_OBJECT_ID}, 0,
            ${MAX_HP}, 0, now(), now(), now()
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.raid_boss_template bt
              ON c.object_id LIKE 'boss:%' AND bt.id = split_part(c.object_id, ':', 2)
       LEFT JOIN yuplink.mystic_item_template t ON t.id = ${BARE_OBJECT_ID}
      WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
        AND c.object_id IS NOT NULL
     ON CONFLICT (map_id, q, r, cycle_no)
     DO UPDATE SET current_hp = 0, killed_at = now(), updated_at = now(),
                   -- у уже заведённой строки запас свой, боевой, и переписывать
                   -- его админской правкой незачем; чиним только нулевой,
                   -- оставшийся от прежней версии «погасить»
                   max_hp = CASE WHEN hp.max_hp > 0 THEN hp.max_hp ELSE EXCLUDED.max_hp END;`;
}
