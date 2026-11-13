// Рубка и посаженное дерево (владелец, 22.10.2026: «деревья, которые садят
// игроки, — они не восстанавливаются после того, как их срубят»).
//
// Метка — raid_map_cells.planted_decor (migrations/trees-02): шаблон, который
// посадил игрок. Ставит её посадка (tree-plant-sql) тем же оператором, что и
// дерево. Дерево посаженное, пока метка равна декору клетки; любую другую смену
// декора (кисть и редактор админа, перенос, отрастание) метку снимает триггер
// базы — дуб карты, вставший потом на это место, посаженным не станет.
//
// Рубка (decor-interact) забирает декор и метку одним оператором и узнаёт,
// было ли дерево посаженным (planted). Посаженное не отрастает: очередь
// возврата для клетки не ставится, а строка raid_decor_respawn этого дерева
// (рассылка посадки, ещё не ушедшая) снимается. Ожидание декора, что был на
// клетке до посадки (placed_at NULL), рубка не трогает — с неё и начинается
// его таймер (владелец 25.10.2026); недосланная рассылка поверх него
// возвращается ожиданию (UNDER_BACK). Кучка под деревом остаётся — её рубка не
// трогает. Откат рубки возвращает и декор, и метку.
import { sqlStr } from "@/server/api/raid-shared";
import { UNDER_BACK, WAKE_HELD } from "@/server/api/beta-raid/decor-respawn-sql";

/** Клетка: с алиасом — «a.map_id = …», без него — столбцы самой правки (как прежний текст рубки). */
const cell = (a: string, mapId: string, q: number, r: number): string => {
  const p = a ? `${a}.` : "";
  return `${p}map_id = ${sqlStr(mapId)} AND ${p}q = ${Math.floor(q)} AND ${p}r = ${Math.floor(r)}`;
};

/**
 * Забрать декор с клетки, только если на ней именно он. Ответ (под
 * wrapJsonCte): q, covered — под декором кучка или мешочек (выражение
 * вызывающего), planted — дерево посадил игрок. Метку читает подзапрос: он
 * видит строку до правки (RETURNING отдаёт уже новую).
 */
export function chopTakeSql(
  mapId: string,
  q: number,
  r: number,
  decorId: string,
  coveredSql: string,
): string {
  const d = sqlStr(decorId);
  return `UPDATE yuplink.raid_map_cells SET decoration_id = NULL, planted_decor = NULL
      FROM (SELECT p.planted_decor AS mark FROM yuplink.raid_map_cells p
             WHERE ${cell("p", mapId, q, r)}) was
     WHERE ${cell("", mapId, q, r)} AND decoration_id = ${d}
     RETURNING q, ${coveredSql} AS covered, COALESCE(was.mark = ${d}, false) AS planted;`;
}

/** Откат рубки: декор (и метку посадки) назад, только если клетка всё ещё пуста. */
export function chopRestoreSql(
  mapId: string,
  q: number,
  r: number,
  decorId: string,
  planted: boolean,
): string {
  const d = sqlStr(decorId);
  const mark = planted ? `, planted_decor = ${d}` : "";
  return `UPDATE yuplink.raid_map_cells SET decoration_id = ${d}${mark}
      WHERE ${cell("", mapId, q, r)} AND decoration_id IS NULL;`;
}

/**
 * Срубили посаженное: его недосланная рассылка (placed_at задан) — долой, а если
 * под ним ждал декор — строка снова ждёт его. Ожидание (placed_at NULL) не
 * удаляем, даже того же шаблона: дуб карты под посаженным дубом отрастёт; его
 * будим — проход заведёт таймер в ближайшую минуту. Пока шла рубка, на клетку
 * успели посадить новое — его рассылку не трогаем (на клетке снова декор).
 */
export function plantedRespawnDropSql(
  mapId: string,
  q: number,
  r: number,
  decorId: string,
): string {
  const at = cell("d", mapId, q, r);
  const own = `${at} AND d.decor_id = ${sqlStr(decorId)} AND d.placed_at IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
                         WHERE ${cell("c", mapId, q, r)} AND c.decoration_id IS NOT NULL)`;
  return `UPDATE yuplink.raid_decor_respawn d SET ${UNDER_BACK}
      WHERE ${own} AND d.under_decor IS NOT NULL;
    DELETE FROM yuplink.raid_decor_respawn d WHERE ${own};
    ${WAKE_HELD} WHERE ${at} AND d.placed_at IS NULL AND d.held_at IS NOT NULL;`;
}
