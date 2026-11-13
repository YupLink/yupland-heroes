// SQL ломбарда героев (hero-pawn-take): кого можно сдать, как снять героя одним
// оператором со снимком и как вернуть его тем же снимком. Тексты отдельно от
// исполнения — их проверяют тесты и EXPLAIN на живой базе.
//
// Герой у игрока — это копия предмета (user_game_item, kind='hero') и, если его
// уже будили, экземпляр (hero_instance: уровень, навыки, экипировка) с книгой
// заклинаний (hero_spellbook, hero_spell_cd — удаляются каскадом). Сдать можно
// только СВОБОДНОГО: не основной (selected_at — он ходит по карте), не отдыхает,
// не на грядке (raid_field_worker), не рыбачит, без гриба DARAI в рюкзаке (гриб в
// мешочек не кладут, §8.65). Прочий рюкзак после оплаты высыпается мешочком на
// клетку основного героя (hero-pawn-drop, §8.73 п. 4; до оплаты строки рюкзака
// лежат по id экземпляра — откат вернёт их вместе с героем). Надетые артефакты —
// строки инвентаря, экземпляр лишь ссылался на них; после оплаты они тоже уходят
// мешочком на клетку (hero-pawn-drop-sql, raid_loot_bag_art). Уникального героя
// (meta.unique) не принимаем вовсе, редкость — только по ярусу шаблона.
import { sqlStr } from "../raid-shared";
import { heroItemLockSql } from "../hero-item-lock";
import { UNIQUE_SQL } from "../heroes-unique";
import type { HeroRarity } from "./hero-any";

/** Таблица снимков сданных героев (migrations/pawn-heroes-01.sql). */
export const PAWN_HERO_TAKE = "yuplink.pawn_hero_take";

/**
 * Редкость героя в ломбарде — ТОЛЬКО по ярусу шаблона, как у спящего
 * (heroes-list-dormant.rarityOfTemplateLevel). hero_instance.rarity не годится:
 * первая прокачка спящего (heroes-read) пишет «rare» любому шаблону ниже 4-го
 * яруса — обычный сдавался бы по цене редкого, а лавка перепродавала бы его
 * как редкого (покупатель получает предмет-шаблон, а он обычный).
 */
export function heroRaritySql(t: string): string {
  const l = `COALESCE(${t}.level, 0)`;
  return `(CASE WHEN ${l} >= 5 THEN 'legendary' WHEN ${l} >= 4 THEN 'epic'
    WHEN ${l} >= 3 THEN 'rare' ELSE 'common' END)`;
}

/**
 * Уникальный герой (meta.unique, heroes-unique) в ломбард не принимается: копия
 * ушла бы из инвентаря — и шаблон снова «свободен» для выпадения, а лавка
 * выставила бы его же на продажу. Один уникальный стал бы двумя.
 */
export const pawnableSql = (t: string): string => `NOT (${UNIQUE_SQL(t)})`;

/** Условие «герой свободен» (h — LEFT JOIN экземпляра; спящий свободен всегда). */
export function pawnFreeSql(h: string): string {
  return `(${h}.id IS NULL OR (${h}.selected_at IS NULL
    AND (${h}.rest_until IS NULL OR ${h}.rest_until <= now())
    AND NOT EXISTS (SELECT 1 FROM yuplink.raid_field_worker fw WHERE fw.hero_id = ${h}.id)
    AND NOT EXISTS (SELECT 1 FROM yuplink.raid_fishing fi
                     WHERE fi.hero_id = ${h}.id AND fi.stopped_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack bp
                     WHERE bp.hero_id = ${h}.id AND bp.count > 0 AND bp.stack_key LIKE 'dmine:%')))`;
}

const FROM = (account: string): string => `FROM yuplink.user_game_item u
    JOIN yuplink.mystic_item_template t ON t.id = u.template_id
    LEFT JOIN yuplink.hero_instance h ON h.item_id = u.id
   WHERE u.account_id = ${sqlStr(account)} AND u.kind = 'hero'`;

/** Свободные герои редкости — каждая копия отдельно (уровни у копий разные). */
export function listFreeHeroesSql(account: string, rarity: HeroRarity): string {
  return `SELECT u.id AS "itemId", u.template_id AS "templateId", t.name,
         t.image_url AS "imageUrl", ${heroRaritySql("t")} AS rarity,
         COALESCE(h.level, 0)::int AS level
    ${FROM(account)}
     AND ${heroRaritySql("t")} = ${sqlStr(rarity)} AND ${pawnableSql("t")} AND ${pawnFreeSql("h")}
   ORDER BY COALESCE(h.level, 0), t.name, u.id
   LIMIT 200;`;
}

/** Почему копию не сдать: есть ли она, уникальна ли, её редкость и свободна ли. Нет строки — не твоя. */
export function heroStateSql(account: string, itemId: string): string {
  return `SELECT ${heroRaritySql("t")} AS rarity, ${UNIQUE_SQL("t")} AS "unique",
         ${pawnFreeSql("h")} AS free
    ${FROM(account)} AND u.id = ${sqlStr(itemId)} LIMIT 1;`;
}

/**
 * Снять ОДНУ копию героя. Три оператора одной строкой запроса (одна неявная
 * транзакция): замок КОПИИ (hero-item-lock — его же берут пробуждение и первая
 * прокачка: разбудить сдаваемого нельзя), замок героя — тот же, что держат
 * выбор основного и постановка на грядку (hero-rest.heroLockSql), — и само
 * снятие. Порядок замков всегда «копия → герой»: никто не берёт их наоборот.
 * Внутри снятия условия «свободен» повторены в DELETE экземпляра: выбери его
 * кто-то основным за миг до нас — строка не удалится, и копия останется.
 *
 * Снимок (предмет, экземпляр, книга и откаты заклинаний) пишется ТЕМ ЖЕ
 * оператором и только за реально удалённую копию: две вкладки, сдающие одного
 * героя, не получат по снимку каждая — вторая не удалит ничего.
 */
export function takeHeroSql(o: {
  account: string;
  itemId: string;
  rarity: HeroRarity;
  op: string;
}): string {
  // Ключ замка героя — как у heroLockSql ('hero:' || id экземпляра). Экземпляр
  // ищется уже под замком копии: разбуженный только что — тоже под замком.
  return `${heroItemLockSql(o.itemId)}
SELECT pg_advisory_xact_lock(hashtext('hero:' || h.id)) AS l
  FROM yuplink.hero_instance h WHERE h.item_id = ${sqlStr(o.itemId)};
WITH cand AS (
  SELECT u.id AS item_id, h.id AS hero_id
    ${FROM(o.account)} AND u.id = ${sqlStr(o.itemId)}
     AND ${heroRaritySql("t")} = ${sqlStr(o.rarity)} AND ${pawnableSql("t")}
     AND ${pawnFreeSql("h")}
   LIMIT 1
),
gone_h AS (
  DELETE FROM yuplink.hero_instance x USING cand c
   WHERE x.id = c.hero_id AND x.selected_at IS NULL
     AND (x.rest_until IS NULL OR x.rest_until <= now())
  RETURNING x.*
),
gone_u AS (
  DELETE FROM yuplink.user_game_item d USING cand c
   WHERE d.id = c.item_id AND (c.hero_id IS NULL OR EXISTS (SELECT 1 FROM gone_h))
  RETURNING d.*
),
memo AS (
  INSERT INTO ${PAWN_HERO_TAKE}
    (op, account_id, item_id, template_id, item, instance, spells, spell_cd)
  SELECT ${sqlStr(o.op)}, ${sqlStr(o.account)}, g.id, g.template_id, to_jsonb(g),
         (SELECT to_jsonb(x) FROM gone_h x LIMIT 1),
         (SELECT jsonb_agg(to_jsonb(s)) FROM yuplink.hero_spellbook s, gone_h x
           WHERE s.hero_id = x.id),
         (SELECT jsonb_agg(to_jsonb(cd)) FROM yuplink.hero_spell_cd cd, gone_h x
           WHERE cd.hero_id = x.id)
    FROM gone_u g
  ON CONFLICT (op) DO NOTHING
  RETURNING op
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT g.id AS "itemId", g.template_id AS "templateId" FROM gone_u g
) _t;`;
}

/** Снимок сделки, ещё не возвращённый, — ответ на слепой повтор моста. */
export function recallTakeSql(op: string): string {
  return `SELECT item_id AS "itemId", template_id AS "templateId"
    FROM ${PAWN_HERO_TAKE} WHERE op = ${sqlStr(op)} AND restored_at IS NULL LIMIT 1;`;
}

/**
 * Разбудили копию, пока мы её снимали (экземпляр появился после снимка). Пути
 * пробуждения ждут замка копии, так что это — страховка от путей мимо него.
 */
export function wokenAfterSql(itemId: string): string {
  return `SELECT id FROM yuplink.hero_instance WHERE item_id = ${sqlStr(itemId)} LIMIT 1;`;
}

/** Выплата за сданных прошла (market-pawn.settlePawn): снимок закрыт, откат его не вернёт. */
export function markPaidSql(ops: string[]): string {
  return `UPDATE ${PAWN_HERO_TAKE} SET paid_at = now()
 WHERE op IN (${ops.map(sqlStr).join(", ")}) AND restored_at IS NULL AND paid_at IS NULL;`;
}

/**
 * Вернуть героя снимком: предмет, экземпляр (если был), книгу и откаты — под
 * прежними id. Тремя операторами одной строкой (одна транзакция): книга
 * ссылается на экземпляр внешним ключом и вставляется после него. Повтор не
 * задваивает (ON CONFLICT DO NOTHING) и не трогает снимок, уже возвращённый
 * или оплаченный (paid_at: за героя заплатили — вернуть его значило бы задвоить).
 */
export function restoreHeroSql(op: string): string {
  const open = `op = ${sqlStr(op)} AND restored_at IS NULL AND paid_at IS NULL`;
  const s = `(SELECT * FROM ${PAWN_HERO_TAKE} WHERE ${open}) s`;
  const rows = (table: string, col: string) =>
    `INSERT INTO yuplink.${table}
  SELECT r.* FROM ${s}, jsonb_populate_recordset(NULL::yuplink.${table},
         COALESCE(s.${col}, '[]'::jsonb)) r
  ON CONFLICT DO NOTHING;`;
  return `INSERT INTO yuplink.user_game_item
  SELECT r.* FROM ${s}, jsonb_populate_record(NULL::yuplink.user_game_item, s.item) r
  ON CONFLICT (id) DO NOTHING;
INSERT INTO yuplink.hero_instance
  SELECT r.* FROM ${s}, jsonb_populate_record(NULL::yuplink.hero_instance, s.instance) r
   WHERE s.instance IS NOT NULL
  ON CONFLICT (id) DO NOTHING;
${rows("hero_spellbook", "spells")}
${rows("hero_spell_cd", "spell_cd")}
UPDATE ${PAWN_HERO_TAKE} SET restored_at = now() WHERE ${open};`;
}
