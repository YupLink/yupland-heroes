// Запись побегов: все переезды одного шага — ОДНИМ оператором.
//
// Вынесено из flee-sql.ts: там живут условия («куда можно», «сквозь что
// можно»), здесь — CTE, которые эти условия проверяют ещё раз в момент
// записи. Разведка и запись читают одну и ту же строку условия (landingSql),
// поэтому разойтись не могут.
import { nanoid } from "nanoid";
import { sqlStr } from "../raid-shared";
import { RUNNER_LAYER, CELL_LAYER } from "./runners";
import { deadAtSql, landingSql, type FleeStep } from "./flee-sql";

/**
 * ПЕРВЫЙ побег объекта: он уходит из клетки в слой беглецов.
 *
 * Вместе с ним переезжает всё, чем он владел по клетке: настройки (свой запас
 * HP, свои награды, снимок удалённого шаблона) и расписка обеспечения Darai —
 * номинал держится за объектом, а не за местом, поэтому в пуле он не
 * задваивается и не теряется.
 *
 * Боевое состояние (beta_raid_object_hp) не пересоздаётся, а ПЕРЕЕЗЖАЕТ той же
 * строкой: её id — ключ, по которому числятся урон каждого игрока
 * (beta_raid_object_run.hp_id) и отметка «награда выдана»
 * (raid_reward_distributed `beta:<id>`). Пересоздай её — и гриб встал бы на
 * новом месте с полным здоровьем, а чужой вклад в бой пропал. Меняется у неё
 * только адрес: клетка и номер слоя.
 *
 * ВЕРСИЮ КАРТЫ (raid_maps.revision) сам побег не трогает. По ней гекс-редактор
 * отличает свой устаревший черновик от чужих правок, и сорок бегающих грибов не
 * дали бы админу сохранить карту вовсе. Соседям о переезде говорит живой поток,
 * а версию двигает уже дельта правды клеток (flee-move → recordMapChange).
 */
function fromCellCtes(n: number, mapId: string, s: FleeStep): string[] {
  const m = sqlStr(mapId);
  const { from, to } = s;
  return [
    `src${n} AS (
      SELECT c.object_id, c.object_config, c.darai_ref, c.darai_hold
        FROM yuplink.raid_map_cells c
       WHERE c.map_id = ${m} AND c.q = ${from.q} AND c.r = ${from.r}
         AND c.object_id = ${sqlStr(s.objectId)}
         AND NOT ${deadAtSql(mapId, from, CELL_LAYER)}
       FOR UPDATE
    )`,
    `dst${n} AS (
      INSERT INTO yuplink.beta_raid_runner
             (id, map_id, q, r, object_id, object_config, darai_ref, darai_hold,
              home_q, home_r, moves, moved_at)
      SELECT ${sqlStr(`brn_${nanoid(10)}`)}, ${m}, ${to.q}, ${to.r},
             -- в клетке обеспечение бывает пустым (колонка допускает NULL), а в
             -- слое — нет: у беглеца «ничего не должен» это ноль, а не «неизвестно»
             src${n}.object_id, src${n}.object_config, src${n}.darai_ref,
             COALESCE(src${n}.darai_hold, 0), ${from.q}, ${from.r}, 1, now()
        FROM src${n}
       WHERE ${landingSql(mapId, s)}
      ON CONFLICT (map_id, q, r) DO NOTHING
      RETURNING id
    )`,
    `clr${n} AS (
      UPDATE yuplink.raid_map_cells c
         SET object_id = NULL, object_config = NULL, darai_ref = NULL, darai_hold = 0,
             saved_at = now()
       WHERE c.map_id = ${m} AND c.q = ${from.q} AND c.r = ${from.r}
         AND EXISTS (SELECT 1 FROM dst${n})
      RETURNING c.q
    )`,
    `hp${n} AS (
      UPDATE yuplink.beta_raid_object_hp h
         SET q = ${to.q}, r = ${to.r}, cycle_no = ${RUNNER_LAYER}
       WHERE h.map_id = ${m} AND h.q = ${from.q} AND h.r = ${from.r}
         AND h.cycle_no = ${CELL_LAYER}
         AND EXISTS (SELECT 1 FROM dst${n})
      RETURNING h.id
    )`,
  ];
}

/** Следующие побеги: объект уже в слое и просто меняет клетку. */
function runnerCtes(n: number, mapId: string, s: FleeStep): string[] {
  const m = sqlStr(mapId);
  const { from, to } = s;
  return [
    `src${n} AS (
      SELECT rn.id FROM yuplink.beta_raid_runner rn
       WHERE rn.map_id = ${m} AND rn.q = ${from.q} AND rn.r = ${from.r}
         AND rn.object_id = ${sqlStr(s.objectId)}
         AND NOT ${deadAtSql(mapId, from, RUNNER_LAYER)}
       FOR UPDATE
    )`,
    `dst${n} AS (
      UPDATE yuplink.beta_raid_runner rn
         SET q = ${to.q}, r = ${to.r}, moves = rn.moves + 1, moved_at = now()
       WHERE rn.id IN (SELECT id FROM src${n}) AND ${landingSql(mapId, s)}
      RETURNING rn.id
    )`,
    `hp${n} AS (
      UPDATE yuplink.beta_raid_object_hp h SET q = ${to.q}, r = ${to.r}
       WHERE h.map_id = ${m} AND h.q = ${from.q} AND h.r = ${from.r}
         AND h.cycle_no = ${RUNNER_LAYER}
         AND EXISTS (SELECT 1 FROM dst${n})
      RETURNING h.id
    )`,
  ];
}

/**
 * ВСЕ побеги одного шага — ОДНИМ оператором.
 *
 * На карте сотня с лишним убегающих (одних мухоморов 138), и в грибной поляне
 * от одного шага разбегается сразу несколько. Запрос на каждого — это рейс к
 * базе по сотне миллисекунд на украшение шага; здесь их столько же, сколько
 * шагов: один.
 *
 * Отвечает по колонке на побег: `m0`, `m1`, … — сколько строк переехало.
 * Ноль значит «не вышло»: клетку заняли, объект успели добить, его там уже нет.
 *
 * Все правки идут в одной транзакции и видят карту ОДНОГО момента: клетка,
 * освобождённая соседом в этом же операторе, для остальных ещё занята. Поэтому
 * выбор клеток (flee-move) считает освободившиеся занятыми — так предсказание
 * и запись говорят об одном и том же.
 */
export function fleeMovesSql(mapId: string, steps: FleeStep[]): string {
  const ctes: string[] = [];
  const cols: string[] = [];
  steps.forEach((step, n) => {
    ctes.push(
      ...(step.layer === RUNNER_LAYER ? runnerCtes(n, mapId, step) : fromCellCtes(n, mapId, step)),
    );
    cols.push(`(SELECT count(*) FROM dst${n})::int AS m${n}`);
  });
  return `WITH ${ctes.join(",\n    ")}\n    SELECT ${cols.join(", ")};`;
}
