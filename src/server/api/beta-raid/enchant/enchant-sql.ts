// SQL лавки зачарования (migrations/enchant-01.sql): заклинания клетки,
// зачарование экземпляра (item_enchant) и журнал попыток (enchant_attempt).
// Текстом — так запросы видно в тестах и на живой базе.
//
// Попытка проходит тремя запросами: заявка (ключ opId + «одна попытка на
// предмет за раз») → оплата (market-money, вне базы одним куском) → итог
// одним утверждением: пометка/удаление предмета и запись итога вместе. Предмет
// за время оплаты увели — итог не пишется (n = 0), и цена возвращается.
import { sqlStr } from "@/server/api/raid-shared";
import type { EnchantCost, EnchantSpell } from "@/lib/enchant/enchant";

/** Ключ попытки в журнале и в ссылках списаний. */
export const attemptRef = (account: string, op: string): string => `enchant:${account}:${op}`;

/** Процент зачарования экземпляра `u` (алиас user_game_item) — колонкой для загрузчиков. */
export const enchantPctSql = (u = "u"): string =>
  `(SELECT e.pct FROM yuplink.item_enchant e WHERE e.item_id = ${u}.id)::float8`;

const int = (n: number): string => String(Math.floor(Number(n) || 0));
const json = (v: unknown): string => `${sqlStr(JSON.stringify(v))}::jsonb`;

/** Заклинания клетки по порядку. */
export const spellsAtSql = (mapId: string, q: number, r: number): string =>
  `SELECT id, name, rarity, boost_min, boost_max, success::float8 AS success, destroy,
          destroy_chance::float8 AS destroy_chance, cost, fx
     FROM yuplink.raid_enchant_spell
    WHERE map_id = ${sqlStr(mapId)} AND q = ${int(q)} AND r = ${int(r)}
    ORDER BY pos, id`;

/**
 * Список клетки целиком, одним утверждением: чего нет в списке — удаляется,
 * остальное вставляется/обновляется с порядком. Чужой id (другая клетка) не
 * перезаписывается: ON CONFLICT обновляет только строку этой же клетки.
 */
export function saveSpellsSql(mapId: string, q: number, r: number, spells: EnchantSpell[]): string {
  const cell = `map_id = ${sqlStr(mapId)} AND q = ${int(q)} AND r = ${int(r)}`;
  const keep = spells.map((s) => sqlStr(s.id)).join(", ");
  const del = `DELETE FROM yuplink.raid_enchant_spell
      WHERE ${cell}${spells.length ? ` AND id NOT IN (${keep})` : ""}`;
  if (!spells.length) return `${del};`;
  const rows = spells
    .map(
      (s, i) => `(${sqlStr(s.id)}, ${sqlStr(mapId)}, ${int(q)}, ${int(r)}, ${i}, ${sqlStr(s.name)},
        ${sqlStr(s.rarity)}, ${int(s.boostMin)}, ${int(s.boostMax)}, ${Number(s.success)},
        ${s.destroy}, ${Number(s.destroyChance)}, ${json(s.cost)}, ${json(s.fx)})`,
    )
    .join(",\n      ");
  return `WITH del AS (${del} RETURNING id)
    INSERT INTO yuplink.raid_enchant_spell
      (id, map_id, q, r, pos, name, rarity, boost_min, boost_max, success, destroy,
       destroy_chance, cost, fx)
    VALUES ${rows}
    ON CONFLICT (id) DO UPDATE SET
      pos = EXCLUDED.pos, name = EXCLUDED.name, rarity = EXCLUDED.rarity,
      boost_min = EXCLUDED.boost_min, boost_max = EXCLUDED.boost_max,
      success = EXCLUDED.success, destroy = EXCLUDED.destroy,
      destroy_chance = EXCLUDED.destroy_chance, cost = EXCLUDED.cost, fx = EXCLUDED.fx,
      updated_at = now()
    WHERE yuplink.raid_enchant_spell.map_id = EXCLUDED.map_id
      AND yuplink.raid_enchant_spell.q = EXCLUDED.q AND yuplink.raid_enchant_spell.r = EXCLUDED.r;`;
}

/** Ид заклинаний, что уже стоят на клетке: чужой id из запроса станет новым. */
export const spellIdsAtSql = (mapId: string, q: number, r: number): string =>
  `SELECT id FROM yuplink.raid_enchant_spell
    WHERE map_id = ${sqlStr(mapId)} AND q = ${int(q)} AND r = ${int(r)}`;

/**
 * Артефакты аккаунта с базовыми числами шаблона, отметкой «надет» и
 * зачарованием. itemId — один предмет (проверка перед попыткой), иначе все.
 */
export function artifactsSql(account: string, itemId?: string): string {
  const acc = sqlStr(account);
  return `WITH worn AS (
       SELECT DISTINCT x.value AS item_id
         FROM yuplink.hero_instance h,
              jsonb_each_text(CASE WHEN jsonb_typeof(h.equipped) = 'object'
                                   THEN h.equipped ELSE '{}'::jsonb END) x
        WHERE h.account_id = ${acc}
     )
     SELECT u.id AS "itemId", u.template_id AS "templateId", t.name, t.image_url AS image,
            t.rarity, t.stat_type AS "statType", t.stat_amount::float8 AS "statAmount",
            t.race, t.race_amount::float8 AS "raceAmount", t.specialization,
            t.spec_amount::float8 AS "specAmount", t.land, t.land_amount::float8 AS "landAmount",
            lt.name AS "landName", COALESCE(t.fish_bonus_pct, 0)::float8 AS "fishBonusPct",
            e.pct::float8 AS "enchantPct", e.spell_name AS "spellName",
            (w.item_id IS NOT NULL) AS equipped
       FROM yuplink.user_game_item u
       JOIN yuplink.mystic_item_template t ON t.id = u.template_id
       LEFT JOIN yuplink.mystic_item_template lt ON lt.id = t.land
       LEFT JOIN yuplink.item_enchant e ON e.item_id = u.id
       LEFT JOIN worn w ON w.item_id = u.id
      WHERE u.account_id = ${acc} AND u.kind = 'artifact'
        ${itemId ? `AND u.id = ${sqlStr(itemId)}` : ""}
      ORDER BY t.name, u.id`;
}

/** Повтор нажатия: что уже записано под этим ключом. */
export const attemptReadSql = (account: string, op: string): string =>
  `SELECT status, outcome, pct, result, error FROM yuplink.enchant_attempt
    WHERE account_id = ${sqlStr(account)} AND op_id = ${sqlStr(op)}`;

/** Зависшая заявка (сервер упал посреди попытки) не держит предмет вечно. */
export const attemptStaleSql = (itemId: string): string =>
  `UPDATE yuplink.enchant_attempt SET status = 'stale', finished_at = now()
    WHERE item_id = ${sqlStr(itemId)} AND status = 'pending'
      AND created_at < now() - interval '10 minutes';`;

export type AttemptClaim = {
  account: string;
  op: string;
  itemId: string;
  templateId: string;
  mapId: string;
  q: number;
  r: number;
  spell: EnchantSpell;
  steps: number;
  cost: EnchantCost[];
};

/**
 * Заявка попытки. Встаёт, только если ключа ещё нет И по предмету нет другой
 * незавершённой (частичный уникальный индекс): две вкладки не заплатят за один
 * артефакт дважды. claimed = 0 — повтор или занято.
 */
export function attemptClaimSql(c: AttemptClaim): string {
  return `WITH ins AS (
      INSERT INTO yuplink.enchant_attempt
        (account_id, op_id, item_id, template_id, map_id, q, r, spell_id, spell, steps, cost, status)
      VALUES (${sqlStr(c.account)}, ${sqlStr(c.op)}, ${sqlStr(c.itemId)}, ${sqlStr(c.templateId)},
              ${sqlStr(c.mapId)}, ${int(c.q)}, ${int(c.r)}, ${sqlStr(c.spell.id)}, ${json(c.spell)},
              ${int(c.steps)}, ${json(c.cost)}, 'pending')
      ON CONFLICT DO NOTHING
      RETURNING op_id
    )
    SELECT (SELECT count(*) FROM ins)::int AS claimed;`;
}

/** Что списано — сразу после оплаты, до броска: журнал знает это даже при сбое ниже. */
export const attemptPaidSql = (account: string, op: string, paid: unknown): string =>
  `UPDATE yuplink.enchant_attempt SET paid = ${json(paid)}
    WHERE account_id = ${sqlStr(account)} AND op_id = ${sqlStr(op)};`;

/** Оплата сорвалась или предмет увели — цена возвращена, ключ отвечает тем же отказом. */
export const attemptRefundSql = (account: string, op: string, error: string): string =>
  `UPDATE yuplink.enchant_attempt
      SET status = 'refunded', error = ${sqlStr(error)}, finished_at = now()
    WHERE account_id = ${sqlStr(account)} AND op_id = ${sqlStr(op)} AND status = 'pending';`;
