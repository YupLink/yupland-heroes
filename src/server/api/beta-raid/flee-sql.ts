// Запросы побега: «куда можно ступить», «сквозь что можно пройти» и разведка.
//
// Отдельным модулем, потому что все они обязаны сходиться в одном правиле:
// клетка, которую разведка сочла проходимой, проверяется теми же условиями ещё
// раз внутри самого переезда (flee-sql-moves). Между разведкой и записью
// проходят миллисекунды, но за них сосед успевает занять ту же клетку — решает
// всегда запись.
//
// Условия ЭКСПОРТИРУЮТСЯ строками: тест утверждает правило по самой константе,
// а не ищет подстроки в собранном запросе.
import { sqlStr } from "../raid-shared";
import { WATER_SQL } from "./cell-sql";
import { RUNNER_HERE, RUNNER_LAYER, CELL_LAYER, deadHpSql, type ObjectLayer } from "./runners";
import type { Hex } from "./flee-rules";
import { POS_MAP_SQL } from "./pos-map-sql";

/**
 * «Сюда объект ступить может» — в терминах клетки `c`, ещё без воды.
 *
 * Запреты физические: нет земли, преграда (декором на карте выложены
 * непроходимые зоны), глухой туман. Босс, сундук, монетка и постройка на клетке
 * побегу НЕ мешают — беглец встаёт ПОД них и там прячется: это ТЗ (runners.ts,
 * 41ea5a7c), и владелец его подтвердил 21.09 («грибы/лягушки могут прятаться
 * под боссом/сундуком/постройкой — верни назад»). Закрытие укрытия 20.09
 * (e702ddfe) откачено.
 *
 * Два исключения из «под что угодно». Судно: клетка с кораблём рисует только
 * корабль (betaCanvasDraw.drawShip) и тап отдаёт судну (useCellTap) — беглец
 * под ним не виден и недосягаем НИКОГДА, а не «пока верхний жив». Другой
 * беглец: слой держит одного на клетку, и двум грибам в одном кусте не
 * разойтись ни на карте, ни в порядке боя.
 */
export const CAN_STAND_DRY = `c.terrain_id IS NOT NULL
       AND c.decoration_id IS NULL
       AND c.void_fog IS NOT TRUE
       AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s
                        WHERE s.map_id = c.map_id AND s.q = c.q AND s.r = c.r)
       AND NOT ${RUNNER_HERE}`;

/**
 * «Сквозь эту клетку объект пройти может» — промежуточная клетка побега на две.
 *
 * Строже посадки ровно на одно: ЖИВОЙ объект клетки — преграда. Встать под него
 * можно (спрятаться), а пробежать насквозь — нет: по журналу прода 401 из 5886
 * двухклеточных побегов шли «сквозь босса», и владелец читал это как «перепрыгнул
 * препятствие» (21.09). Правило то же, что держит игрока (step-facts
 * .stepBlockedReason): держит объект, только пока жив; поверженный, но ещё не
 * убранный — нет. Постройка игрока не держит — и беглеца тоже.
 */
export const CAN_PASS_DRY = `${CAN_STAND_DRY}
       AND (c.object_id IS NULL OR ${deadHpSql("c", CELL_LAYER)})`;

/** Клетка `c` — вода (по названию типа местности, как везде: cell-sql). */
const IS_WATER = `EXISTS (SELECT 1 FROM yuplink.mystic_item_template t
                           WHERE t.id = c.terrain_id AND ${WATER_SQL})`;

/**
 * Вода — преграда для того, кто стоит на суше.
 *
 * Для того, кто в воде уже стоит, «не заходить в воду» — запрет ни о чём: на
 * карте таких объектов семь (мухоморы посреди залива), и с общим запретом они
 * не могли сдвинуться ВООБЩЕ. Проверено на живой карте: у мухомора (-26,116)
 * все 37 клеток вокруг — вода, и разведка возвращала одну проходимую из
 * тридцати семи. Отсюда `swims`: запрет на воду снимается ровно с того, кто в
 * ней и живёт. Новых запретов не добавляем — на сушу такой объект выбраться
 * может, суша преградой не объявлена.
 */
export const canStandSql = (swims: boolean) =>
  swims ? CAN_STAND_DRY : `${CAN_STAND_DRY} AND NOT ${IS_WATER}`;

/** Проход — с тем же правилом воды: сухопутный и сквозь воду не пробежит. */
export const canPassSql = (swims: boolean) =>
  swims ? CAN_PASS_DRY : `${CAN_PASS_DRY} AND NOT ${IS_WATER}`;

/** Мёртвый не бегает: у поверженного объекта побег отнимать нечего. */
export const deadAtSql = (mapId: string, at: Hex, layer: ObjectLayer) =>
  `EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
            WHERE h.map_id = ${sqlStr(mapId)} AND h.q = ${at.q} AND h.r = ${at.r}
              AND h.cycle_no = ${layer}
              AND (h.killed_at IS NOT NULL OR h.current_hp <= 0))`;

/** Клетка цели свободна для боевого состояния беглеца (осиротевших строк нет). */
const HP_SLOT_FREE = (mapId: string, at: Hex) =>
  `NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
                WHERE h.map_id = ${sqlStr(mapId)} AND h.q = ${at.q} AND h.r = ${at.r}
                  AND h.cycle_no = ${RUNNER_LAYER})`;

/** На клетке нет игрока. Предсказание (flee-move) игроков избегает, но
 *  РЕШАЕТ запись — а она их не проверяла, и беглец мог переехать прямо на
 *  игрока (пройти «сквозь меня» или встать за спину на мою же клетку). Игрок —
 *  с ЭТОЙ карты: стоящий на другом этаже в тех же координатах не мешает. */
const NO_PLAYER = (mapId: string, at: Hex) =>
  `NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_positions p
                WHERE p.q = ${at.q} AND p.r = ${at.r} AND ${POS_MAP_SQL("p")} = ${sqlStr(mapId)})`;

/** Клетка цели годится под переезд: проходима, слой беглецов пуст, игрока нет. */
export const LANDING = (mapId: string, to: Hex, swims: boolean) =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
            WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${to.q} AND c.r = ${to.r}
              AND ${canStandSql(swims)})
   AND ${HP_SLOT_FREE(mapId, to)}
   AND ${NO_PLAYER(mapId, to)}`;

/**
 * Промежуточная клетка годится под проход: сквозь неё можно, игрока нет.
 * Раньше её проверял только план (flee-rules), а запись смотрела лишь цель —
 * и между планом и записью на via мог встать сосед. Теперь решает запись.
 */
export const PASSAGE = (mapId: string, via: Hex, swims: boolean) =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
            WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${via.q} AND c.r = ${via.r}
              AND ${canPassSql(swims)})
   AND ${NO_PLAYER(mapId, via)}`;

/** Один переезд: кто, откуда, куда и через что. Слой решает, из клетки он
 *  уходит или уже из слоя беглецов; `swims` — стоит ли он в воде (тогда вода
 *  ему не преграда); `via` — промежуточная клетка побега на две, null на одну. */
export type FleeStep = {
  from: Hex;
  to: Hex;
  via: Hex | null;
  objectId: string;
  layer: ObjectLayer;
  swims: boolean;
};

/** Всё условие переезда: посадка на цель и, для побега на две, проход через via. */
export function landingSql(mapId: string, s: FleeStep): string {
  const landing = LANDING(mapId, s.to, s.swims);
  return s.via ? `${landing}\n   AND ${PASSAGE(mapId, s.via, s.swims)}` : landing;
}

/**
 * Разведка местности вокруг шага — ОДНИМ запросом на весь шаг, а не на каждого
 * беглеца. Побег считается на каждый шаг игрока, и лишний рейс к базе здесь
 * дороже самой механики.
 *
 * `free` — можно встать (посадка), `pass` — можно пройти насквозь (строже:
 * без живого объекта). `players` — кто стоит в этом же куске карты: между
 * равными по удалённости клетками объект выбирает ту, где меньше народу
 * (flee-rules.pickFleeCell). Подзапрос не зависит от строки, поэтому база
 * считает его один раз.
 *
 * `water` едет отдельной колонкой, а не вшито в `free`: разведка одна на весь
 * шаг, а разбегаются от него разные — сухопутному вода запрещена, водяному
 * нет (canStandSql). Решает это уже вызывающий, по клетке самого беглеца.
 */
export function fleeGridSql(mapId: string, cells: Hex[]): string {
  const values = cells.map((h) => `(${h.q}, ${h.r})`).join(",");
  return `SELECT n.q, n.r, COALESCE(${CAN_STAND_DRY}, false) AS free,
            COALESCE(${CAN_PASS_DRY}, false) AS pass,
            COALESCE(${IS_WATER}, false) AS water,
            (SELECT COALESCE(jsonb_agg(jsonb_build_array(p.q, p.r)), '[]'::jsonb)
               FROM yuplink.beta_raid_positions p
              WHERE (p.q, p.r) IN (${values})
                AND ${POS_MAP_SQL("p")} = ${sqlStr(mapId)}) AS players
       FROM (VALUES ${values}) AS n(q, r)
       LEFT JOIN yuplink.raid_map_cells c
              ON c.map_id = ${sqlStr(mapId)} AND c.q = n.q AND c.r = n.r;`;
}
