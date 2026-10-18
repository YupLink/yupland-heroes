// Отбор боссов по уровню — чистая функция, без серверного обвеса.
//
// Вынесена из admin-restore, чтобы её можно было прогнать в тесте: тот файл
// тянет createServerFn и доступ к базе, а проверять здесь надо ровно строку
// условия.
/**
 * Условие «босс нужного уровня». Уровень лежит отдельной колонкой шаблона
 * (raid_boss_template.level) — раньше он жил внутри имени, и отобрать по нему
 * было нечем. Без диапазона возвращаются все боссы, как и прежде.
 */
export function bossLevelSql(from?: number, to?: number): string {
  if (from === undefined && to === undefined) return "";
  const lo = Math.min(from ?? 1, to ?? 100);
  const hi = Math.max(from ?? 1, to ?? 100);
  // Уровень берётся из шаблона, а у босса без шаблона — из его снимка на
  // клетке (boss-snapshot): иначе отбор по уровню молча пропускал бы боссов,
  // чью заготовку удалили, хотя на карте они живые и играбельные.
  return ` AND (EXISTS (SELECT 1 FROM yuplink.raid_boss_template b
                         WHERE b.id = split_part(c.object_id, ':', 2)
                           AND COALESCE(b.level, 1) BETWEEN ${lo} AND ${hi})
                OR (NOT EXISTS (SELECT 1 FROM yuplink.raid_boss_template b2
                                 WHERE b2.id = split_part(c.object_id, ':', 2))
                    AND COALESCE(
                          CASE WHEN jsonb_typeof(c.object_config->'tpl'->'level') = 'number'
                               THEN (c.object_config->'tpl'->>'level')::int END, 1)
                        BETWEEN ${lo} AND ${hi}))`;
}
