// SQL зачарования героев (migrations/hero-rite-01.sql): обряды клетки, шаблоны
// нового героя, выдача копии и журнал попытки. Журнал — общий с лавкой
// артефактов (enchant_attempt): чтение, «зависла» и оплата — те же запросы
// (enchant-sql); здесь — заявка и итог со своим снимком обряда.
import { sqlStr } from "@/server/api/raid-shared";
import type { HeroRite, HeroRiteResult, HeroRiteTarget } from "@/lib/enchant/heroRite";
import type { EnchantCost } from "@/lib/enchant/enchant";
import { UNIQUE_SQL } from "@/server/api/heroes-unique";
import { heroItemLockSql } from "@/server/api/hero-item-lock";
import { heroRaritySql, pawnFreeSql, pawnableSql } from "@/server/api/beta-raid/hero-pawn-sql";

const int = (n: number): string => String(Math.floor(Number(n) || 0));
const json = (v: unknown): string => `${sqlStr(JSON.stringify(v))}::jsonb`;

/** Ключ попытки в журнале и в ссылках списаний и снимков героев. */
export const riteRef = (account: string, op: string): string => `herorite:${account}:${op}`;

/** Предмет попытки в журнале: копии через запятую, по порядку — одна заявка на набор. */
export const riteItemKey = (heroIds: string[]): string => `heroes:${[...heroIds].sort().join(",")}`;

/** Обряды клетки по порядку. */
export const ritesAtSql = (mapId: string, q: number, r: number): string =>
  `SELECT id, name, rarity, need, success::float8 AS success, lose_min, lose_max, cost
     FROM yuplink.raid_hero_rite
    WHERE map_id = ${sqlStr(mapId)} AND q = ${int(q)} AND r = ${int(r)}
    ORDER BY pos, id`;

/** Ид обрядов, что уже стоят на клетке: чужой id из запроса станет новым. */
export const riteIdsAtSql = (mapId: string, q: number, r: number): string =>
  `SELECT id FROM yuplink.raid_hero_rite
    WHERE map_id = ${sqlStr(mapId)} AND q = ${int(q)} AND r = ${int(r)}`;

/** Список клетки целиком одним утверждением (как заклинания: чужой id не перезапишется). */
export function saveRitesSql(mapId: string, q: number, r: number, rites: HeroRite[]): string {
  const cell = `map_id = ${sqlStr(mapId)} AND q = ${int(q)} AND r = ${int(r)}`;
  const keep = rites.map((s) => sqlStr(s.id)).join(", ");
  const del = `DELETE FROM yuplink.raid_hero_rite
      WHERE ${cell}${rites.length ? ` AND id NOT IN (${keep})` : ""}`;
  if (!rites.length) return `${del};`;
  const rows = rites
    .map(
      (s, i) => `(${sqlStr(s.id)}, ${sqlStr(mapId)}, ${int(q)}, ${int(r)}, ${i}, ${sqlStr(s.name)},
        ${sqlStr(s.rarity)}, ${int(s.need)}, ${Number(s.success)}, ${int(s.loseMin)},
        ${int(s.loseMax)}, ${json(s.cost)})`,
    )
    .join(",\n      ");
  const t = "yuplink.raid_hero_rite";
  return `WITH del AS (${del} RETURNING id)
    INSERT INTO ${t} (id, map_id, q, r, pos, name, rarity, need, success, lose_min, lose_max, cost)
    VALUES ${rows}
    ON CONFLICT (id) DO UPDATE SET
      pos = EXCLUDED.pos, name = EXCLUDED.name, rarity = EXCLUDED.rarity, need = EXCLUDED.need,
      success = EXCLUDED.success, lose_min = EXCLUDED.lose_min, lose_max = EXCLUDED.lose_max,
      cost = EXCLUDED.cost, updated_at = now()
    WHERE ${t}.map_id = EXCLUDED.map_id AND ${t}.q = EXCLUDED.q AND ${t}.r = EXCLUDED.r;`;
}

/**
 * Кем может выйти новый герой: живые шаблоны героев яруса target, кроме
 * уникальных (один на всю игру — обряд их не плодит). Выбирает сервер случайно.
 */
export const riteTemplatesSql = (target: HeroRiteTarget): string =>
  `SELECT t.id, t.name, t.image_url AS "imageUrl"
     FROM yuplink.mystic_item_template t
    WHERE t.kind = 'hero' AND COALESCE(t.active, true)
      AND ${heroRaritySql("t")} = ${sqlStr(target)} AND NOT (${UNIQUE_SQL("t")})
    ORDER BY t.id`;

/**
 * Свои свободные герои редкости — как у ломбарда (не основной, не отдыхает, не
 * на грядке, не рыбачит, без гриба; не «один на всю игру»), но без уже
 * уникальных: уник по ярусу шаблона легендарный, а в обряд он не идёт.
 */
export function riteFreeHeroesSql(account: string, rarity: string): string {
  return `SELECT u.id AS "itemId", u.template_id AS "templateId", t.name,
         t.image_url AS "imageUrl", ${heroRaritySql("t")} AS rarity,
         COALESCE(h.level, 0)::int AS level
    FROM yuplink.user_game_item u
    JOIN yuplink.mystic_item_template t ON t.id = u.template_id
    LEFT JOIN yuplink.hero_instance h ON h.item_id = u.id
   WHERE u.account_id = ${sqlStr(account)} AND u.kind = 'hero'
     AND ${heroRaritySql("t")} = ${sqlStr(rarity)} AND ${pawnableSql("t")} AND ${pawnFreeSql("h")}
     AND COALESCE(h.rarity, '') <> 'unique'
   ORDER BY COALESCE(h.level, 0), t.name, u.id
   LIMIT 200;`;
}

/**
 * Герой первой ячейки становится уником (§8.91): тот же экземпляр — уровень,
 * навыки, снаряжение — с редкостью 'unique'. Спящего (экземпляра ещё нет) будит
 * сразу уником, как пробуждение (heroes-wake): под замком копии, только если
 * копия всё ещё у игрока. n = 1 — стал уником.
 */
export function makeUniqueSql(itemId: string, account: string): string {
  const item = sqlStr(itemId);
  const acc = sqlStr(account);
  return `${heroItemLockSql(itemId)}
WITH up AS (
  UPDATE yuplink.hero_instance h SET rarity = 'unique', updated_at = now()
   WHERE h.item_id = ${item} AND h.account_id = ${acc}
  RETURNING h.id
),
ins AS (
  INSERT INTO yuplink.hero_instance
    (id, wallet, template_id, item_id, rarity, level, likes_spent, equipped, source, source_chip_id)
  SELECT 'hero_' || substr(md5('rite:' || u.id), 1, 16), u.wallet, u.template_id, u.id, 'unique',
         0, 0, '{}'::jsonb, 'inventory_item', NULL
    FROM yuplink.user_game_item u
   WHERE u.id = ${item} AND u.account_id = ${acc} AND u.kind = 'hero'
     AND NOT EXISTS (SELECT 1 FROM yuplink.hero_instance x WHERE x.item_id = u.id)
  ON CONFLICT DO NOTHING
  RETURNING id
)
SELECT ((SELECT count(*) FROM up) + (SELECT count(*) FROM ins))::int AS n;`;
}

/**
 * Новая копия героя — как свежий герой (подарок, лавка): строка предмета без
 * экземпляра, уровень 0. id от ключа попытки: повтор второй копии не создаст.
 */
export function grantHeroSql(o: {
  itemId: string;
  account: string;
  wallet: string;
  templateId: string;
}): string {
  return `INSERT INTO yuplink.user_game_item (id, account_id, wallet, template_id, kind, source)
    VALUES (${sqlStr(o.itemId)}, ${sqlStr(o.account)}, ${sqlStr(o.wallet)},
            ${sqlStr(o.templateId)}, 'hero', 'hero_rite')
    ON CONFLICT (id) DO NOTHING;`;
}

export type RiteClaim = {
  account: string;
  op: string;
  heroIds: string[];
  mapId: string;
  q: number;
  r: number;
  rite: HeroRite;
  cost: EnchantCost[];
};

/** Заявка: ключ opId + «одна незавершённая на набор героев» (индекс enchant_attempt). */
export function riteClaimSql(c: RiteClaim): string {
  return `WITH ins AS (
      INSERT INTO yuplink.enchant_attempt
        (account_id, op_id, item_id, template_id, map_id, q, r, spell_id, spell, steps, cost, status)
      VALUES (${sqlStr(c.account)}, ${sqlStr(c.op)}, ${sqlStr(riteItemKey(c.heroIds))}, NULL,
              ${sqlStr(c.mapId)}, ${int(c.q)}, ${int(c.r)}, ${sqlStr(c.rite.id)},
              ${json({ ...c.rite, kind: "hero_rite", heroIds: c.heroIds })}, 0, ${json(c.cost)},
              'pending')
      ON CONFLICT DO NOTHING
      RETURNING op_id
    )
    SELECT (SELECT count(*) FROM ins)::int AS claimed;`;
}

/** Итог в журнал: только из «pending» — второй итог не встанет. */
export const riteDoneSql = (account: string, op: string, res: HeroRiteResult): string =>
  `UPDATE yuplink.enchant_attempt
      SET status = 'done', outcome = ${sqlStr(res.outcome)}, result = ${json(res)},
          finished_at = now()
    WHERE account_id = ${sqlStr(account)} AND op_id = ${sqlStr(op)} AND status = 'pending';`;
