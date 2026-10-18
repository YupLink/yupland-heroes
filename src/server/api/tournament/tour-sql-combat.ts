// «Урон» и «Убийства» — что из журнала ударов (beta_raid_object_run) считается
// боем с боссом. Отдельно от tour-sql.ts: ресурсная ветка подтяжки живёт там же
// и правится своим ходом.
//
// Правило владельца (§8.27): урон и убийства — ВСЕ боссы карты; сундуки,
// артефакты и охрана шахт — нет. Раньше босса узнавали по строке шаблона в
// raid_boss_template, и бой с боссом, чей шаблон удалили, не засчитывался
// (05.10: «Болотная Лягушка» rbt_lW2W3-Wo, 5000 урона и убийство мимо
// турниров). А драться с ним можно: клетка хранит снимок шаблона
// (boss-snapshot.targetFromSnapshot), и удар пишет run с тем же id.
//
// Теперь босс — это:
//   • id из raid_boss_template (как раньше), или
//   • id шаблона босса по префиксу справочника `rbt_` (raid-admin создаёт
//     шаблоны только так; item-info тем же префиксом отличает босса), если
//     такого id нет среди предметов mystic_item_template — сундуки и
//     артефакты пишут run своим id и боссами не становятся, даже удалённые.
// Цель удара в run — id шаблона без префикса клетки; `boss:` срезаем на
// всякий случай, как и раньше.

/** id цели без префикса клетки: 'boss:rbt_…' → 'rbt_…'. Алиас run — `o`. */
const TARGET_ID = "regexp_replace(o.object_id, '^boss:', '')";

/** Удар `o` пришёлся по боссу — живому шаблону или удалённому (по снимку клетки). */
export const BOSS_RUN_SQL = `(EXISTS (SELECT 1 FROM yuplink.raid_boss_template bt WHERE bt.id = ${TARGET_ID})
            OR (${TARGET_ID} ~ '^rbt_'
                AND NOT EXISTS (SELECT 1 FROM yuplink.mystic_item_template m WHERE m.id = ${TARGET_ID})))`;

/**
 * Источник очков подтяжки урона или убийств (колонки scoreSql): удары по
 * боссам в окне `w`. Ключ — 'run:<id удара>': событие засчитывается один раз.
 */
export function combatSrcSql(kills: boolean): string {
  return `SELECT w.id AS tournament_id, 'run:' || o.id AS ref, o.account_id,
              ${kills ? "1" : "o.damage"}::numeric AS qty, o.created_at AS at
         FROM w
         JOIN yuplink.beta_raid_object_run o ON o.created_at >= w.since AND o.created_at < w.till
        WHERE o.rounds > 0 AND ${kills ? "o.killed" : "o.damage > 0"}
          AND ${BOSS_RUN_SQL}`;
}
