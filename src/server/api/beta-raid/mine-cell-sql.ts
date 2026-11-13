// Клетка-шахта в SQL: сквозь шахту не пройти никому (ПРАВИЛА §8.59 п. 9).
//
// Признак ровно тот же, что у окна постройки и захвата (building-action →
// lib/buildingEffect.cellBuildingEffect), а не урезанный `name ILIKE '%шахт%'`
// из флажков: «Лесопилка» шахта только по meta.effect, а «Лавка Алхимика» и
// «Золотой Карьер» на проде — шахты эффектом, назначенным самой КЛЕТКЕ.
// Иначе окно открыло бы шахту, а шаг прошёл бы сквозь неё.
//
// Лестница та же, что в JS:
//   1. эффект клетки (building_config.effect), если это известный эффект;
//   2. эффект шаблона (meta.effect), если известный;
//   3. поле effect у шаблона есть, но пустое/чужое — «ничего», имя не смотрим;
//   4. иначе по имени — первое совпадение по порядку BY_NAME: верфь, вышка,
//      дерево и табличка проверяются раньше шахты.
// Совпадение с JS держит тест (mine-cell-sql.test.ts) и сверка с прод-данными.

/** Эффекты, которые buildingEffect() признаёт явными (BuildingEffect без null). */
export const KNOWN_EFFECTS = [
  "portal",
  "shipyard",
  "watchtower",
  "leveltree",
  "sign",
  "tavern",
  "mine",
  "field",
  "warehouse",
  "market",
  "building_shop",
  "university",
  "museum",
  "town_hall",
  "boost",
  "spellbook",
  "chambers",
  "oblivion",
  "tournament",
  "casino",
  "buckwheat",
  "enchant",
  "hero_enchant",
  "art_gen",
] as const;

/** Имя «похоже на шахту» (BY_NAME, effect "mine"). */
export const MINE_NAME_RE = "(шахт|рудник|mine)";

/** Имена, которые BY_NAME разбирает РАНЬШЕ шахты: «Шахта у верфи» — верфь. */
export const BEFORE_MINE_NAME_RE =
  "(верф|вервь|shipyard|вышк|обзорн|watchtower|дерев|древо|древ[оа]|tree|таблич|вывеск|указател|sign)";

const KNOWN_SQL = KNOWN_EFFECTS.map((e) => `'${e}'`).join(", ");

/**
 * Шахта по постройке САМОЙ клетки `c` (лестница выше). `t` — алиас шаблона:
 * у вложенной проверки блока он свой.
 */
export const ownMineSql = (c = "c", t = "mine_t"): string => `(${c}.building_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM yuplink.mystic_item_template ${t}
                WHERE ${t}.id = ${c}.building_id
                  AND COALESCE(${t}.name, '') <> ''
                  AND CASE
                        WHEN ${c}.building_config->>'effect' IN (${KNOWN_SQL})
                          THEN ${c}.building_config->>'effect' = 'mine'
                        WHEN jsonb_typeof(${t}.meta) = 'object'
                             AND ${t}.meta->>'effect' IN (${KNOWN_SQL})
                          THEN ${t}.meta->>'effect' = 'mine'
                        WHEN jsonb_typeof(${t}.meta) = 'object' AND ${t}.meta ? 'effect'
                          THEN false
                        ELSE COALESCE(${t}.name, '') ~* '${MINE_NAME_RE}'
                             AND NOT COALESCE(${t}.name, '') ~* '${BEFORE_MINE_NAME_RE}'
                      END))`;

/**
 * Клетка `c` — часть блока (режим бога), где постройка-шахта стоит на другой
 * клетке: картинка шахты накрывает весь блок, значит и стена — весь блок (как
 * здание у buildingHeldSql). Блок узнаётся по group_id — индекс
 * raid_map_cells_group_idx; у клетки вне блока подзапроса нет вовсе.
 */
export const blockMineSql = (c = "c"): string => `(${c}.group_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM yuplink.raid_map_cells mine_b
                WHERE mine_b.map_id = ${c}.map_id AND mine_b.group_id = ${c}.group_id
                  AND mine_b.building_id IS NOT NULL
                  AND ${ownMineSql("mine_b", "mine_bt")}))`;

/**
 * На клетке `c` стоит шахта (любого вида — дерево, камень, золото, DARAI,
 * энергия…) или клетка — часть блока-шахты. Удалённый шаблон и шаблон без
 * имени шахтой не считаются — как в loadCellBuilding (там это «постройки
 * нет»). Таблица клеток — `c` (или передайте алиас).
 */
export const mineCellSql = (c = "c"): string => `(${ownMineSql(c)}
   OR ${blockMineSql(c)})`;

/** Отказ шага на клетку шахты — ключом словаря (serverErrorText переведёт). */
export const MINE_BLOCKED = "braid.mine_blocked";

/** Копать/закапывать/выкапывать на клетке шахты нельзя — ключ отказа. */
export const MINE_NO_DIG = "dig.under_mine";
