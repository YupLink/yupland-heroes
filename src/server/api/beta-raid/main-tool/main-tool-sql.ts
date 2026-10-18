// SQL основного инструмента (ПРАВИЛА §8.24): гард удара, выбор, чтение.
//
// Правило — lib/raid/mainTool.ts; здесь его зеркало для оператора удара
// (tool-wear hitSql, поимка удочкой — fishing-catch-sql): решает не ответ
// чтения, а база под локом героя
// `bp:<герой>`. Тот же лок берут выбор основного (setMainSql), удар, откат и
// выдача в рюкзак, поэтому из пары «сменил основной / ударил старым» проходит
// одно, и в руках в каждый миг ровно один инструмент.
//
// Комментарии внутри SQL — только блочные; изменяющие CTE — верхним уровнем.
import { sqlStr } from "@/server/api/raid-shared";

/** Что нужно удару: инструмент декора (ключ стопки), лопата или удочка (§8.35). */
export type ToolNeedKind = "item" | "shovel" | "rod";

/** Галочка семейства у своего товара: лопата — is_shovel, удочка — is_rod. */
const FLAG = { shovel: "is_shovel", rod: "is_rod" } as const;

/** Лопата (удочка) ли ключ стопки (выражение с ключом, NULL — нет). */
const familyKeySql = (key: string, f: "shovel" | "rod"): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_custom_item mci
            WHERE mci.id = split_part(${key}, ':', 2) AND mci.${FLAG[f]})`;

const shovelKeySql = (key: string): string => familyKeySql(key, "shovel");

/** Стопок семейства с целой штукой у героя (выражение). */
const familyCountSql = (hero: string, f: "shovel" | "rod"): string =>
  `(SELECT count(*) FROM yuplink.raid_hero_backpack sx
     JOIN yuplink.raid_custom_item sci
       ON sx.kind = 'custom' AND sci.id = split_part(sx.stack_key, ':', 2)
    WHERE sx.hero_id = ${hero} AND sci.${FLAG[f]} AND sx.count >= 1)`;

/** Записанный основной героя (NULL — не выбран или героя нет). */
const storedSql = (hero: string): string =>
  `(SELECT mhi.main_tool FROM yuplink.hero_instance mhi WHERE mhi.id = ${hero})`;

/**
 * Можно ли бить стопкой `key` как основным инструментом героя — выражение для
 * оператора удара (лок героя уже взят). Зеркало effectiveMain∘pickMain:
 *  • записан ровно этот ключ — да (целую штуку проверяет сам удар);
 *  • декору: основного сейчас нет (записанный кончился и его не заменяет
 *    другая лопата) — да, стопка становится основной; кончилась лопата в
 *    руках, а стопка удара — сама лопата (её замена) — тоже да;
 *  • лопате (ключ обязан быть лопатой): записанная лопата кончилась — да, любой
 *    другой лопатой героя; основного нет вовсе — да, если лопата у героя одна;
 *  • удочке — так же, как лопате (семейство по галочке is_rod, §8.35).
 * Записанная удочка, кончившись, декору и лопате не мешает (гард не строже
 * правила: правило в этом случае ждёт «Взять», удар откажет и сам).
 */
export function mainOkSql(heroId: string, key: string, need: ToolNeedKind): string {
  const [hero, k] = [sqlStr(heroId), sqlStr(key)];
  const stored = storedSql(hero);
  const same = `COALESCE(${stored} = ${k}, false)`;
  const alive = `EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack mx
                  WHERE mx.hero_id = ${hero} AND mx.stack_key = ${stored} AND mx.count >= 1)`;
  const storedShovel = shovelKeySql(stored);
  const shovels = familyCountSql(hero, "shovel");
  // Декору: основного нет — да; кончилась лопата в руках — её место заняла
  // другая лопата, и она же инструмент этого декора (админ может так задать).
  if (need === "item") {
    return `(${same} OR (NOT ${alive} AND (NOT ${storedShovel} OR ${shovels} = 0 OR ${shovelKeySql(k)})))`;
  }
  const f = need;
  return `(${familyKeySql(k, f)} AND (${same} OR (NOT ${alive} AND (${familyKeySql(stored, f)} OR ${familyCountSql(hero, f)} = 1))))`;
}

/**
 * Удар стопкой, которой ещё нет в руках (выбор при однозначности, замена
 * кончившейся лопаты), делает её основной тем же оператором — только если удар
 * прошёл (`hitCte` — CTE удара).
 */
export const adoptSql = (heroId: string, key: string, hitCte: string): string =>
  `UPDATE yuplink.hero_instance hi SET main_tool = ${sqlStr(key)}
    WHERE hi.id = ${sqlStr(heroId)} AND hi.main_tool IS DISTINCT FROM ${sqlStr(key)}
      AND EXISTS (SELECT 1 FROM ${hitCte})
   RETURNING 1`;

/**
 * Взять в руки (key) или убрать из рук (null) — под локом героя, тем же, что у
 * удара. Взять можно только стопку с целой штукой: проверка — тем же оператором.
 */
export function setMainSql(heroId: string, key: string | null): string {
  const hero = sqlStr(heroId);
  const lock = `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${heroId}`)})) AS l;`;
  const cond =
    key === null
      ? ""
      : `AND EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack b
                      WHERE b.hero_id = ${hero} AND b.stack_key = ${sqlStr(key)} AND b.count >= 1)`;
  return `${lock}
    WITH upd AS (
      UPDATE yuplink.hero_instance hi SET main_tool = ${key === null ? "NULL" : sqlStr(key)}
       WHERE hi.id = ${hero} ${cond}
      RETURNING 1
    )
    SELECT row_to_json(_t.*) AS _row FROM (SELECT EXISTS (SELECT 1 FROM upd) AS set) _t;`;
}

/** Записанный основной героя и лопата (удочка) ли он — для окон (effectiveMain). */
export const storedMainSql = (heroId: string): string =>
  `SELECT hi.main_tool AS key, ${shovelKeySql("hi.main_tool")} AS shovel,
          ${familyKeySql("hi.main_tool", "rod")} AS rod
     FROM yuplink.hero_instance hi WHERE hi.id = ${sqlStr(heroId)};`;

/**
 * Всё для выбора стопки удара одним запросом: записанный основной (и лопата
 * ли) и свои товары рюкзака с целой штукой — лопата (удочка) ли, имя, «Износ
 * за удар».
 */
export function toolStateSql(heroId: string): string {
  return `SELECT hi.main_tool AS "mainKey", ${shovelKeySql("hi.main_tool")} AS "mainShovel",
          ${familyKeySql("hi.main_tool", "rod")} AS "mainRod",
          COALESCE((
            SELECT json_agg(json_build_object(
                     'stackKey', b.stack_key, 'count', b.count, 'wear', b.wear,
                     'shovel', COALESCE(ci.is_shovel, false), 'rod', COALESCE(ci.is_rod, false),
                     'name', COALESCE(ci.name, b.name), 'toolWear', ci.tool_wear) ORDER BY b.stack_key)
              FROM yuplink.raid_hero_backpack b
              LEFT JOIN yuplink.raid_custom_item ci ON ci.id = split_part(b.stack_key, ':', 2)
             WHERE b.hero_id = hi.id AND b.kind = 'custom' AND b.count >= 1), '[]'::json) AS stacks
     FROM yuplink.hero_instance hi WHERE hi.id = ${sqlStr(heroId)};`;
}
