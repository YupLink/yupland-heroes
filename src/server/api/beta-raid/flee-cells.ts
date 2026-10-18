// Кто на карте убегает и где он стоит — снимок в памяти процесса.
//
// Побег проверяется на КАЖДОМ шаге игрока, а таких объектов на карте десятки из
// шестнадцати тысяч клеток. Без снимка каждый шаг платил бы походом в базу за
// ответом «рядом никого». Со снимком расход нулевой: соседей проверяет обычный
// Map в памяти.
//
// Снимок — ПОДСКАЗКА, а не решение. Настоящие проверки (жив ли объект, свободна
// ли клетка, тот ли объект там стоит) живут в самом запросе на переезд
// (flee-sql), и протухший снимок безвреден: в худшем случае объект упустит один
// побег или мы зря сходим в базу.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { swrCache } from "../../cache/swr";
import { CELL_LAYER, RUNNER_LAYER, deadHpSql, type ObjectLayer } from "./runners";

/** Полминуты: карту правит админ руками, а спрашивают снимок на каждый шаг. */
const TTL_MS = 30_000;

/** Убегающий объект: что это и на каком он слое. */
export type Fleeing = { objectId: string; layer: ObjectLayer };

/**
 * Клетка → все убегающие на ней. Их бывает ДВОЕ: объект самой клетки и
 * спрятавшийся под ним беглец (runners.ts). Раньше здесь лежал один на клетку,
 * и верхний терял побег навсегда, стоило кому-то заползти под него, — на живой
 * карте так замер мухомор (-36,77), накрывший чужого беглеца.
 */
type Cells = Map<string, Fleeing[]>;

/**
 * Снимок обновляется ФОНОМ (swrCache): протухший отдаётся сразу, за свежим
 * шаг не ждёт. Раньше здесь был обычный кэш с TTL, и раз в тридцать секунд
 * чей-то ход платил сканом всей карты; а после каждой админской правки —
 * платил первый же ход, потому что снимок выбрасывался насухо.
 */
const cache = swrCache<Cells>({ ttl: TTL_MS, load: fetchFleeCells });

/**
 * Карту поправили (админ, полное сохранение) — снимок пора обновить.
 *
 * Именно ПОМЕТИТЬ, а не выбросить: выброшенный снимок заставлял следующий шаг
 * ждать полный скан карты, а это ровно тот момент, когда админ правит карту и
 * тут же по ней ходит. Обновление уходит фоном и доезжает за десятки
 * миллисекунд; сам побег от свежести снимка не зависит — кто убегает и куда,
 * решает SQL переезда (flee-sql).
 */
export function dropFleeCache(mapId?: string): void {
  cache.stale(mapId);
  if (mapId) cache.warm(mapId);
}

/**
 * Объект переехал сам — правим снимок на месте, без похода в базу.
 *
 * `layer` — тот, С КОТОРОГО он ушёл, и без него не обойтись: под объектом
 * клетки прячется беглец, и оба они сплошь и рядом одного шаблона
 * (`chest:chest_5n1U1qYqVj` у всех мухоморов). По одному объекту их не
 * различить, и снимок вычёркивал бы наугад.
 */
export function noteFleeMoved(
  mapId: string,
  from: { q: number; r: number },
  to: { q: number; r: number },
  objectId: string,
  layer: ObjectLayer,
): void {
  const hit = cache.peek(mapId);
  if (!hit) return;
  const fromKey = `${from.q},${from.r}`;
  const left = (hit.get(fromKey) ?? []).filter((f) => f.objectId !== objectId || f.layer !== layer);
  if (left.length) hit.set(fromKey, left);
  else hit.delete(fromKey);
  // Переехавший объект всегда оказывается в слое беглецов — из клетки он ушёл.
  const toKey = `${to.q},${to.r}`;
  hit.set(toKey, [
    ...(hit.get(toKey) ?? []).filter((f) => f.layer !== RUNNER_LAYER),
    { objectId, layer: RUNNER_LAYER },
  ]);
}

/**
 * Где стоят убегающие: «q,r» → объект и его слой.
 *
 * Два источника. Объекты, ещё стоящие в клетках: у босса флаг живёт своей
 * колонкой (raid_boss_template.flees), у предмета — в meta.flees. И весь слой
 * беглецов целиком: раз объект оттуда, он уже убегал и убегает дальше.
 *
 * Шахты исключены нарочно: у шахты к клетке привязаны владение и добыча
 * (raid_mine_state), и уехавшая шахта увезла бы чужую собственность.
 *
 * Поверженные не попадают в снимок вовсе: мёртвый не бегает, а рядом с ним
 * игроки ходят часто — иначе каждый их шаг стоил бы заведомо отказного запроса.
 */
export async function loadFleeCells(mapId: string): Promise<Cells> {
  return cache.get(mapId);
}

/** Сам поход в базу за снимком. Зовётся только кэшем — своим или фоновым. */
async function fetchFleeCells(mapId: string): Promise<Cells> {
  const rows = (await mcpExec(
    `SELECT c.q, c.r, c.object_id, ${CELL_LAYER} AS layer
       FROM yuplink.raid_map_cells c
       LEFT JOIN yuplink.raid_boss_template bt
              ON c.object_id LIKE 'boss:%' AND bt.id = split_part(c.object_id, ':', 2)
       LEFT JOIN yuplink.mystic_item_template t
              ON c.object_id NOT LIKE 'boss:%'
             AND t.id = CASE WHEN c.object_id LIKE '%:%'
                             THEN split_part(c.object_id, ':', 2) ELSE c.object_id END
      WHERE c.map_id = ${sqlStr(mapId)} AND c.object_id IS NOT NULL
        AND COALESCE(t.kind, '') <> 'mine'
        AND (bt.flees IS TRUE
             OR lower(COALESCE(t.meta->>'flees', '')) IN ('true', '1'))
        AND NOT ${deadHpSql("c", CELL_LAYER)}
      UNION ALL
     SELECT rn.q, rn.r, rn.object_id, ${RUNNER_LAYER} AS layer
       FROM yuplink.beta_raid_runner rn
      WHERE rn.map_id = ${sqlStr(mapId)}
        AND NOT ${deadHpSql("rn", RUNNER_LAYER)};`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number; object_id: string; layer: number }>;

  // Клетка может дать ДВЕ строки (свой объект и беглец под ним) — копим списком.
  const cells: Cells = new Map();
  for (const c of rows ?? []) {
    const key = `${Number(c.q)},${Number(c.r)}`;
    const list = cells.get(key);
    const one: Fleeing = {
      objectId: String(c.object_id),
      layer: (Number(c.layer) === RUNNER_LAYER ? RUNNER_LAYER : CELL_LAYER) as ObjectLayer,
    };
    if (list) list.push(one);
    else cells.set(key, [one]);
  }
  return cells;
}
