// Слой беглецов: объекты, которые ушли с клетки и стоят ПОД её содержимым.
//
// Клетка карты держит ровно один объект (raid_map_cells.object_id) — этого
// хватало, пока объекты стояли смирно. Убегающему грибу этого мало: по ТЗ он
// прячется за монеткой, сундуком, боссом и постройкой, то есть встаёт на уже
// занятую клетку. Поэтому убежавший объект уходит из клетки в собственный слой
// (таблица beta_raid_runner) со своими координатами, своими настройками и своей
// распиской Darai. (Закрытие укрытия 20.09 владелец отменил 21.09: «верни
// назад»; под судно — единственное исключение, см. flee-sql.CAN_STAND_DRY.)
//
// Порядок слоёв простой и один на всё: СВЕРХУ объект самой клетки, ПОД ним
// беглец. Пока верхний жив — игрок взаимодействует с ним; убил или забрал —
// открывается беглец. Верхний слой при этом не изменился ни на байт: всё, что
// читало object_id клетки, читает его и дальше.
//
// Проход беглец НЕ закрывает: в клетке его нет, а step-facts/hexPassable
// спрашивают именно клетку. Так и задумано — иначе гриб запирал бы проходы,
// вставая в узком месте, и его нельзя было бы обойти.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

/**
 * Номер слоя в beta_raid_object_hp.cycle_no.
 *
 * У объектов карты этот столбец всегда был нулём, и КАЖДЫЙ прежний запрос
 * спрашивает ровно `cycle_no = 0`. Поэтому номер слоя занял его: боевое
 * состояние беглеца делит клетку с чужой строкой и остаётся невидимым для всего
 * старого кода. Отдельная колонка `layer` читалась бы честнее, но любой
 * забытый запрос выбирал бы из двух строк случайную (LIMIT 1) и приписывал бы
 * объекту клетки чужое HP.
 */
export const CELL_LAYER = 0;
export const RUNNER_LAYER = 1;

/** Слой, на котором лежит объект: клетка или беглец. */
export type ObjectLayer = typeof CELL_LAYER | typeof RUNNER_LAYER;

export type RunnerRow = {
  id: string;
  q: number;
  r: number;
  objectId: string;
  /** Правки объекта и снимок удалённого шаблона — те же, что были в клетке. */
  config: unknown;
};

/** Беглец стоит на этой клетке (алиас клетки в запросе — `c`). */
export const RUNNER_HERE = `EXISTS (SELECT 1 FROM yuplink.beta_raid_runner rr
                                    WHERE rr.map_id = c.map_id AND rr.q = c.q AND rr.r = c.r)`;

/**
 * Объект слоя `layer` на клетке `alias` уже повержен. Строки нет — значит цел:
 * боевое состояние заводится первым ударом (encounter-hp).
 */
export const deadHpSql = (alias: string, layer: ObjectLayer) =>
  `EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
            WHERE h.map_id = ${alias}.map_id AND h.q = ${alias}.q AND h.r = ${alias}.r
              AND h.cycle_no = ${layer}
              AND (h.killed_at IS NOT NULL OR h.current_hp <= 0))`;

/**
 * Все беглецы карты. Их десятки против шестнадцати тысяч клеток, поэтому едут
 * отдельным списком, а не колонкой на всю карту (packCells делает так же с
 * куполом и добытыми).
 */
export async function loadRunners(mapId: string): Promise<RunnerRow[]> {
  const rows = (await mcpExec(
    `SELECT id, q, r, object_id, object_config
       FROM yuplink.beta_raid_runner WHERE map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  )) as Array<{
    id: string;
    q: number;
    r: number;
    object_id: string;
    object_config: unknown;
  }>;
  return (rows ?? []).map((x) => ({
    id: String(x.id),
    q: Number(x.q),
    r: Number(x.r),
    objectId: String(x.object_id),
    config: x.object_config ?? null,
  }));
}

/** Беглец на конкретной клетке — null, если его там нет. */
export async function runnerAt(mapId: string, q: number, r: number): Promise<RunnerRow | null> {
  const rows = (await mcpExec(
    `SELECT id, q, r, object_id, object_config FROM yuplink.beta_raid_runner
      WHERE map_id = ${sqlStr(mapId)} AND q = ${Math.floor(q)} AND r = ${Math.floor(r)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string; q: number; r: number; object_id: string; object_config: unknown }>;
  const row = rows?.[0];
  return row
    ? {
        id: String(row.id),
        q: Number(row.q),
        r: Number(row.r),
        objectId: String(row.object_id),
        config: row.object_config ?? null,
      }
    : null;
}

/**
 * Убрать беглеца с карты (админ).
 *
 * Боевое состояние уходит вместе с ним: осиротевшая строка HP на клетке
 * досталась бы следующему беглецу, и он встал бы сразу поверженным — та же
 * причина, что и в admin-live-batch. Расписку Darai не трогаем: её сводит
 * settleDaraiHold, он же вернёт номинал в пул.
 */
export function dropRunnerSql(mapId: string, q: number, r: number): string {
  const m = sqlStr(mapId);
  return `DELETE FROM yuplink.beta_raid_object_hp h
           WHERE h.map_id = ${m} AND h.q = ${q} AND h.r = ${r}
             AND h.cycle_no = ${RUNNER_LAYER};
          DELETE FROM yuplink.beta_raid_runner rn
           WHERE rn.map_id = ${m} AND rn.q = ${q} AND rn.r = ${r};`;
}
