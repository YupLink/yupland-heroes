// SQL входа в мешочек и сундук (владелец, 29–30.09.2026; ПРАВИЛА §8.23).
//
// «Открыть» — платный вход, и каждое новое открытие платит заново (30.09):
// мешочек — 1 энергия, сундук (обычный и магический) — занятые ячейки в миг
// открытия, но не меньше 1 (lib/openPass). Живой вход ничего не даёт даром и
// не продлевается. Вход живёт, пока окно открыто и герой не сошёл с клетки,
// откуда открыл (updated_at его позиции тот же), но не дольше 10 минут от
// нажатия (страховочный срок). Окно внутри входа перечитывается сколько
// угодно, «Положить» и «Забрать» бесплатны.
//
// Открытие — одна транзакция из операторов одной строки: лок входа (аккаунт +
// цель), строка позиции FOR UPDATE (шаг подождёт — вход не запишется с чужой
// клеткой), затем один WITH: цена, списание энергии (touch_energy_atomic —
// нехватка роняет всю транзакцию, и не пишется ничего) и запись входа.
// Без платы и БЕЗ записи (ни продления, ни переезда на новую клетку):
//  • слепой повтор моста того же нажатия (op) — сколько бы попыток моста ни
//    было, даже если окно тем временем закрыло вход или герой шагнул:
//    закрытие не стирает ключ нажатия, а гасит срок;
//  • вход ещё жив — второй тап по ещё не перечитанному окну или после
//    потерянного ответа не платит второй раз за то же открытие.
// Цена выше той, что показала кнопка (сеть наполнили под рукой), — не платим
// и не открываем: окно перечитает и покажет новую.
//
// Без обёртки wrapJson: изменяющие CTE — верхний уровень. Комментарии внутри
// SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import { locksSql } from "@/server/api/beta-raid/chest/chest-net-sql";

/** Страховочный срок входа, минут: от нажатия, не продлевается. */
export const PASS_MINUTES = 10;

/** Цели входа: мешочек, обычный сундук (по id), магический (по клетке — сеть у владельца одна). */
export const bagTarget = (bagId: string): string => `lb:${bagId}`;
export const plainTarget = (chestId: string): string => `pc:${chestId}`;
export const magicTarget = (mapId: string, q: number, r: number): string => `mc:${mapId}:${q}:${r}`;

/**
 * Живой вход: не истёк (и не закрыт окном), и герой с тех пор не сходил с
 * клетки. target — SQL (литерал или выражение: окно клетки проверяет каждый
 * мешочек своей строкой).
 */
export function passAliveSql(account: string, target: string): string {
  return `EXISTS (SELECT 1 FROM yuplink.raid_open_pass op
                   JOIN yuplink.beta_raid_positions pos ON pos.account_id = op.account_id
                  WHERE op.account_id = ${sqlStr(account)} AND op.target = ${target}
                    AND op.until > now() AND pos.updated_at IS NOT DISTINCT FROM op.pos_at)`;
}

/**
 * Цена сундука: занятые ячейки (вид по 20, пыль — целая ячейка), как в окне,
 * но не меньше 1 — пустой тоже 1 (chestOpenPrice, lib/openPass).
 */
export const cellsPriceSql = (table: string, where: string): string =>
  `GREATEST(1, (SELECT COALESCE(SUM(CEIL(s.count / ${CELL_SIZE}.0)), 0) FROM ${table} s
     WHERE ${where} AND s.count > 0))`;

/**
 * Ответ открытия: стоял ли рядом, было ли даром (повтор нажатия или живой
 * вход — ничего не записано), сколько заплачено сейчас, цена и срок входа.
 */
export type OpenRow = {
  near: boolean;
  free?: boolean;
  paid: number | string;
  price: number | string | null;
  until: string | null;
};

/**
 * Открыть вход: новое открытие — плата и новый вход (10 минут от нажатия).
 * Повтор того же нажатия (op) или живой вход — без платы и без записи.
 * priceSql — цена в миг открытия; maxPrice — цена, которую показала кнопка:
 * сейчас дороже — ни платы, ни входа. cell — где стоит объект: вход только со
 * своей или соседней клетки.
 */
export function openPassSql(o: {
  account: string;
  wallet: string;
  target: string;
  priceSql: string;
  op: string;
  cell: { q: number; r: number };
  maxPrice?: number;
}): string {
  const [acc, t, op] = [sqlStr(o.account), sqlStr(o.target), sqlStr(o.op)];
  const [q, r] = [Math.floor(o.cell.q), Math.floor(o.cell.r)];
  const near = `(abs(pos.q - ${q}) + abs(pos.r - ${r}) + abs(pos.q + pos.r - ${q} - ${r})) / 2 <= 1`;
  const cap = Number.isFinite(o.maxPrice) ? `AND price.c <= ${Math.floor(Number(o.maxPrice))}` : "";
  return `${locksSql(`pass:${o.account}:${o.target}`)}
     SELECT 1 FROM yuplink.beta_raid_positions WHERE account_id = ${acc} FOR UPDATE;
     DELETE FROM yuplink.raid_open_pass
      WHERE account_id = ${acc} AND until < now() - interval '1 hour';
     WITH pos AS (
       SELECT p.q, p.r, p.updated_at FROM yuplink.beta_raid_positions p WHERE p.account_id = ${acc}
     ),
     cur AS (
       SELECT c.until, c.pos_at, c.op FROM yuplink.raid_open_pass c
        WHERE c.account_id = ${acc} AND c.target = ${t}
     ),
     near AS (SELECT 1 FROM pos WHERE ${near}),
     /* Без платы и без записи: повтор моста того же нажатия (заплачено первой
        попыткой — даже если вход тем временем закрыли или герой шагнул) или
        вход ещё жив (тап по ещё не перечитанному окну). Живой вход при этом
        не продлевается и не переписывается. */
     free AS (
       SELECT 1 FROM cur, pos
        WHERE cur.op = ${op}
           OR (cur.until > now() AND cur.pos_at IS NOT DISTINCT FROM pos.updated_at)
     ),
     price AS (SELECT (${o.priceSql})::numeric AS c),
     /* Новое открытие: рядом, не даром и не дороже показанного кнопкой. */
     go AS (
       SELECT 1 FROM near, price WHERE NOT EXISTS (SELECT 1 FROM free) ${cap}
     ),
     need AS (SELECT price.c FROM price, go WHERE price.c > 0),
     /* Нехватка энергии — исключение not_enough_energy: транзакция целиком назад. */
     paid AS (
       SELECT need.c FROM need CROSS JOIN LATERAL yuplink.touch_energy_atomic(${sqlStr(o.wallet)}, need.c) e
     ),
     /* Вход этого нажатия: срок — от него, версия позиции — нынешняя. */
     put AS (
       INSERT INTO yuplink.raid_open_pass (account_id, target, until, pos_at, op, cost, at)
       SELECT ${acc}, ${t}, now() + interval '${PASS_MINUTES} minutes', pos.updated_at, ${op},
              COALESCE((SELECT c FROM paid), 0), now()
         FROM pos, go
       ON CONFLICT (account_id, target) DO UPDATE
         SET until = EXCLUDED.until, pos_at = EXCLUDED.pos_at, op = EXCLUDED.op,
             cost = EXCLUDED.cost, at = EXCLUDED.at
       RETURNING until
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM near) AS near, EXISTS (SELECT 1 FROM free) AS free,
              COALESCE((SELECT c FROM paid), 0) AS paid, (SELECT c FROM price) AS price,
              COALESCE((SELECT until FROM put), (SELECT until FROM cur)) AS until
     ) _t;`;
}

/**
 * Закрыть входы (окно закрыли): мешочки по id и — если chest не false — сундук
 * клетки (магический по клетке, обычный — тот, что на ней стоит). Окно
 * мешочков шлёт chest: false — вход в сундук под мешочком оно не трогает.
 * ops — ключи нажатий этого окна (как их пишет openPassSql): закрываются только
 * его входы, и опоздавшее закрытие не погасит вход, который тем временем
 * оплатило новое окно; без ops (вкладка до выката) — все входы клетки.
 * Строку не стираем, а гасим срок: ключ нажатия остаётся, и опоздавший повтор
 * моста того же «Открыть» второй раз не заплатит (openPassSql видит свой op).
 */
export function closePassSql(o: {
  account: string;
  mapId: string;
  q: number;
  r: number;
  bagIds: readonly string[];
  chest?: boolean;
  ops?: readonly string[];
}): string {
  const [q, r] = [Math.floor(o.q), Math.floor(o.r)];
  const chest = o.chest !== false;
  const ids = [...(chest ? [magicTarget(o.mapId, q, r)] : []), ...o.bagIds.map(bagTarget)];
  const listed = ids.length > 0 ? `target IN (${ids.map(sqlStr).join(", ")})` : "false";
  const plain = chest
    ? `OR target IN (SELECT 'pc:' || c.id FROM yuplink.raid_plain_chest c
                      WHERE c.map_id = ${sqlStr(o.mapId)} AND c.q = ${q} AND c.r = ${r})`
    : "";
  const own = o.ops?.length ? `AND op IN (${o.ops.map(sqlStr).join(", ")})` : "";
  return `UPDATE yuplink.raid_open_pass SET until = now()
     WHERE account_id = ${sqlStr(o.account)} AND until > now()
       AND (${listed} ${plain}) ${own};`;
}
