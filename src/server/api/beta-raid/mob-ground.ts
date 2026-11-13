// Куда генерация не ставит мобов: дорога и жила (владелец, 22.10.2026: «мобов на
// жилах и дорогах не спавнить!!»; уточнение того же дня: «генерация — не
// позволено … при беге могут туда зайти. пусть будут — их прогонят если надо»).
//
// Моб — объект клетки с id `boss:<шаблон>` (`mob:` — тем же правилом, если
// такой появится), а для генерации ещё и убегающее существо-«сундук» (Фей, Заяц
// DarAi, Юпик Любитель… — шаблон предмета с meta.flees, как в flee-cells).
// Запрет — на то, что ставит моба САМО: точки возрождения (встать и шаг),
// автораздача, возврат беглеца-босса домой кнопкой «Восстановить». Бегство НЕ
// ограничено: убегая, босс и существо встают и на дорогу, и на жилу. Ручная
// правка админа (кисть, перенос в режиме бога, редактор карт) — его слово.
// Стоявших на дорогах и жилах боссов переселила migrations/mob-relocate-01.
//
// Жила — строка raid_map_vein (накладка поверх местности, §8.59 п. 13),
// дорога — raid_map_cells.road_id (непустая).
import { mcpExec } from "@/server/db/mcpClient";

/** Объект клетки — моб или босс (по id). */
export function isMobId(id: string | null | undefined): boolean {
  return typeof id === "string" && /^(boss|mob):/.test(id);
}

/** То же в SQL: `col` — колонка с id объекта. */
export const mobIdSql = (col: string): string => `(${col} LIKE 'boss:%' OR ${col} LIKE 'mob:%')`;

/** Шаблон предмета убегает (meta.flees) — признак тот же, что в flee-cells. */
const FLEES = (a: string) => `lower(COALESCE(${a}.meta->>'flees', '')) IN ('true', '1')`;

/** Id шаблона из id объекта клетки: `chest:<id>` → `<id>` (как split_part в SQL). */
export const bareTplId = (id: string): string => (id.includes(":") ? id.split(":")[1] : id);

/** SQL: объект `col` — убегающее существо-«сундук» (шаблон предмета с meta.flees). */
export const fleeingTplSql = (col: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.mystic_item_template mgt
            WHERE mgt.id = CASE WHEN ${col} LIKE '%:%'
                                THEN split_part(${col}, ':', 2) ELSE ${col} END
              AND ${FLEES("mgt")})`;

/** SQL: генерация не ставит объект `col` на дорогу и жилу — моб/босс или беглец-существо. */
export const spawnGuardedSql = (col: string): string =>
  `(${mobIdSql(col)} OR ${fleeingTplSql(col)})`;

/** Шаблоны убегающих существ — их единицы, читаем все разом. */
export async function fleeingTplIds(): Promise<Set<string>> {
  const rows = (await mcpExec(
    `SELECT t.id FROM yuplink.mystic_item_template t WHERE ${FLEES("t")};`,
    { wrapJson: true },
  )) as Array<{ id: string }> | null;
  return new Set((rows ?? []).map((row) => String(row.id)));
}

/** Под клеткой `a` (строка raid_map_cells) лежит жила. */
export const veinHereSql = (a: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_vein mgv
            WHERE mgv.map_id = ${a}.map_id AND mgv.q = ${a}.q AND mgv.r = ${a}.r)`;

/**
 * На клетке `a` дорога. Пустая строка и голые запятые — не дорога: игра её там
 * не видит и не рисует (map-roads.cellRoadId).
 */
export const roadHereSql = (a: string): string =>
  `(NULLIF(btrim(replace(${a}.road_id, ',', '')), '') IS NOT NULL)`;

/** Клетка `a` (строка raid_map_cells) годится мобу: не дорога и не жила. */
export const mobGroundSql = (a: string): string =>
  `(NOT ${roadHereSql(a)} AND NOT ${veinHereSql(a)})`;
