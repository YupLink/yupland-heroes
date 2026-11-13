// Сломанный артефакт слетает с героя (§8.63 п.3): текст запросов событий
// поломки (таблица art_break_notice, migrations/art-broken-01.sql) и снятия
// сломанного с героя вне удара. Текстом — чтобы тест видел ровно то, что уйдёт в
// базу. Снятие при самом ударе — в beta-raid/art-wear-hit.ts (тот же запрос, что
// износ), массовое при запуске — migrations/art-broken-launch.sql.
import { sqlStr } from "@/server/api/raid-shared";

/** Сколько плашек отдать за раз: поломок за бой — единицы. */
export const ART_BREAK_NOTICE_LIMIT = 20;

/** Непоказанные события аккаунта, старые первыми — плашки идут по очереди. */
export function breakNoticesSql(account: string): string {
  return `SELECT id, item_id AS "itemId", name, image_url AS "imageUrl"
       FROM yuplink.art_break_notice
      WHERE account_id = ${sqlStr(account)} AND shown_at IS NULL
      ORDER BY created_at, id
      LIMIT ${ART_BREAK_NOTICE_LIMIT}`;
}

/** Пометить показанными — только свои и только ещё не показанные. */
export function markShownSql(account: string, ids: string[]): string | null {
  const list = [...new Set(ids.filter(Boolean))];
  if (list.length === 0) return null;
  return `UPDATE yuplink.art_break_notice
        SET shown_at = now()
      WHERE account_id = ${sqlStr(account)} AND shown_at IS NULL
        AND id IN (${list.map(sqlStr).join(",")})
      RETURNING id`;
}

/**
 * Снять сломанное (износ 100) с героя — одним запросом, те же правила, что у
 * удара: предмет остаётся в инвентаре, событие — для плашки владельцу героя.
 * Зовёт рынок героев после покупки: купленный герой не приезжает в сломанном.
 * key — ключ события (лот): повтор того же ключа ничего не задвоит.
 */
export function stripBrokenFromHeroSql(heroId: string, key: string): string {
  const hero = sqlStr(heroId);
  return `WITH h AS (
       SELECT id, account_id, equipped::jsonb AS eq FROM yuplink.hero_instance
        WHERE id = ${hero} AND jsonb_typeof(equipped::jsonb) = 'object'
     ),
     gone AS (
       SELECT DISTINCT u.id, u.account_id, u.template_id, t.name, t.image_url
         FROM h CROSS JOIN LATERAL jsonb_each_text(h.eq) e
         JOIN yuplink.user_game_item u ON u.id = e.value
         LEFT JOIN yuplink.mystic_item_template t ON t.id = u.template_id
        WHERE u.kind = 'artifact' AND u.wear >= 100 AND u.account_id = h.account_id
     ),
     strip AS (
       UPDATE yuplink.hero_instance x
          SET equipped = COALESCE((
                SELECT jsonb_object_agg(e.key, e.value)
                  FROM jsonb_each_text(x.equipped::jsonb) e
                 WHERE e.value NOT IN (SELECT id FROM gone)
              ), '{}'::jsonb),
              updated_at = now()
        WHERE x.id = ${hero} AND EXISTS (SELECT 1 FROM gone)
       RETURNING x.id
     ),
     note AS (
       INSERT INTO yuplink.art_break_notice
              (id, account_id, item_id, template_id, name, image_url, hero_id)
       SELECT 'abn_' || ${sqlStr(key)} || '_' || g.id, g.account_id, g.id, g.template_id,
              g.name, g.image_url, ${hero}
         FROM gone g
       ON CONFLICT (id) DO NOTHING
       RETURNING id
     )
     SELECT (SELECT count(*) FROM strip)::int AS stripped,
            (SELECT count(*) FROM note)::int AS noted;`;
}
