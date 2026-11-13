// SQL записи на турнир (tour-entry.ts, tour-entry-settle.ts): занять строку,
// подтвердить оплату, погасить попытку, снять погашенную, прочитать свою,
// найти зависшие и прочитать журналы платы по ключу попытки.
//
// Запись живёт в два шага: строка tournament_entry с paid=false → плата
// (resource-pay) → paid=true. Пока строка не оплачена, очков по ней нет
// (tour-sql.scoreSql) и в участниках её не считают. Сорванную попытку сначала
// гасят (ключ → `<ключ>:void`, voidSql) и только потом возвращают плату и
// снимают строку: живая попытка, которая ещё дожмёт плату, промахнётся отметкой
// «оплачено» и вернёт всё сама (tour-entry.confirmFailed).
import { sqlStr } from "../raid-shared";
import {
  TOUR_FEE_KIND,
  TOUR_FEE_REFUND_KIND,
  TOUR_LIVE,
  type TourEntryPrice,
} from "@/lib/tournament/types";

/**
 * Сколько ждём неоплаченную строку, прежде чем счесть её зависшей: оплата идёт
 * миллисекунды, а дольше висит только попытка, оборванная на полпути.
 */
export const TOUR_ENTRY_STALE = "interval '2 minutes'";

/** Погашенная попытка: ключ платежа с хвостом — отметка «оплачено» по ключу её не найдёт. */
const VOID = ":void";
export const voidRef = (ref: string): string => `${ref}${VOID}`;
export const isVoidRef = (ref: string | null | undefined): boolean => !!ref?.endsWith(VOID);
/** Ключ попытки из pay_ref строки (погашенной — без хвоста). */
export const attemptRef = (ref: string): string =>
  isVoidRef(ref) ? ref.slice(0, -VOID.length) : ref;
/** Строку пора разбирать: зависла дольше TOUR_ENTRY_STALE или уже погашена. */
const DUE = `(e.joined_at < now() - ${TOUR_ENTRY_STALE} OR e.pay_ref LIKE '%${VOID}')`;

/**
 * Открыт ли турнир для записи (алиас t). Проверку (dry) видит только админ;
 * запланированный черновик ещё не помечен боевым — его видно, если запуск
 * боевой (TOUR_LIVE).
 */
export function openWhere(admin: boolean): string {
  return `((t.status = 'running' AND t.ends_at > now() AND ${admin ? "true" : "NOT t.dry"})
        OR (t.status = 'draft' AND t.start_at IS NOT NULL AND ${admin || TOUR_LIVE}))`;
}

const entryOf = (id: string, account: string): string =>
  `e.tournament_id = ${sqlStr(id)} AND e.account_id = ${sqlStr(account)}`;

/**
 * Занять строку одним оператором: турнир открыт → вставка с ценой ИЗ БАЗЫ
 * (клиент цену не присылает), ключом платежа этой попытки и кошельком
 * плательщика; пустая цена — строка сразу оплачена. Конфликт по PK (турнир,
 * аккаунт) — читаем существующую: оплачена ли, зависла ли (старше
 * TOUR_ENTRY_STALE) и чей у неё ключ. cur видит снимок ДО вставки: вставили —
 * cur пуст, и наоборот.
 */
export function claimSql(o: {
  id: string;
  account: string;
  wallet: string;
  admin?: boolean;
  payRef: string;
}): string {
  const [tid, acc] = [sqlStr(o.id), sqlStr(o.account)];
  return `WITH t AS (
  SELECT t.id, t.entry_price FROM yuplink.tournament t
   WHERE t.id = ${tid} AND ${openWhere(o.admin === true)}
   FOR SHARE
),
ins AS (
  INSERT INTO yuplink.tournament_entry
    (tournament_id, account_id, joined_at, fee, paid, price, pay_ref, pay_wallet)
  SELECT t.id, ${acc}, now(), 0, t.entry_price = '[]'::jsonb, t.entry_price, ${sqlStr(o.payRef)}, ${sqlStr(o.wallet)} FROM t
  ON CONFLICT (tournament_id, account_id) DO NOTHING
  RETURNING joined_at, paid, price, pay_ref, pay_wallet
),
cur AS (
  SELECT e.joined_at, e.paid, e.price, e.pay_ref, e.pay_wallet,
         ${DUE} AS stale
    FROM yuplink.tournament_entry e WHERE ${entryOf(o.id, o.account)}
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT EXISTS (SELECT 1 FROM t) AS open,
         EXISTS (SELECT 1 FROM ins) AS mine,
         COALESCE((SELECT paid FROM ins), (SELECT paid FROM cur)) AS paid,
         COALESCE((SELECT stale FROM cur), false) AS stale,
         COALESCE((SELECT price FROM ins), (SELECT price FROM cur)) AS price,
         COALESCE((SELECT pay_ref FROM ins), (SELECT pay_ref FROM cur)) AS pay_ref,
         COALESCE((SELECT pay_wallet FROM ins), (SELECT pay_wallet FROM cur)) AS pay_wallet,
         extract(epoch from COALESCE((SELECT joined_at FROM ins), (SELECT joined_at FROM cur))) * 1000
           AS joined_ms
) _t;`;
}

/** Оплачено: строка этой попытки (тот же ключ) → paid; очки — с момента оплаты. */
export function paidSql(id: string, account: string, payRef: string): string {
  return `WITH u AS (
  UPDATE yuplink.tournament_entry e SET paid = true, joined_at = now()
   WHERE ${entryOf(id, account)} AND NOT e.paid AND e.pay_ref = ${sqlStr(payRef)}
  RETURNING e.joined_at
)
SELECT row_to_json(_t.*) AS _row FROM (
  SELECT extract(epoch from u.joined_at) * 1000 AS joined_ms FROM u
) _t;`;
}

/**
 * Погасить попытку ref: ключ строки → `ref:void`, paid=false. Обычный разбор
 * гасит только неоплаченную; force — плательщик, у которого плата сорвалась:
 * он знает исход своего ключа лучше разбора, который мог счесть строку
 * оплаченной («не проверить»), — тогда снимаются и очки, набранные по ней
 * (пока турнир не дошёл до выплаты). n — погашено строк.
 */
export function voidSql(id: string, account: string, ref: string, force = false): string {
  const scores = (table: string, a: string) => `${a} AS (
  DELETE FROM yuplink.${table} x USING u, yuplink.tournament t
   WHERE x.tournament_id = u.tournament_id AND x.account_id = u.account_id
     AND t.id = u.tournament_id AND t.status IN ('draft', 'running')
  RETURNING 1
)`;
  return `WITH u AS (
  UPDATE yuplink.tournament_entry e SET paid = false, pay_ref = ${sqlStr(voidRef(ref))}
   WHERE ${entryOf(id, account)} AND e.pay_ref = ${sqlStr(ref)}${force ? "" : " AND NOT e.paid"}
  RETURNING e.tournament_id, e.account_id
)${
    force
      ? `,
${scores("tournament_point", "p")},
${scores("tournament_score", "s")}`
      : ""
  }
SELECT row_to_json(_t.*) AS _row FROM (SELECT (SELECT count(*) FROM u)::int AS n) _t;`;
}

/** Снять неоплаченную строку с этим ключом (погашенную — voidRef): следующая запись — новая строка. */
export function dropSql(id: string, account: string, payRef: string): string {
  return `WITH d AS (
  DELETE FROM yuplink.tournament_entry e
   WHERE ${entryOf(id, account)} AND NOT e.paid AND e.pay_ref = ${sqlStr(payRef)}
  RETURNING 1
)
SELECT row_to_json(_t.*) AS _row FROM (SELECT count(*)::int AS n FROM d) _t;`;
}

/** Своя строка отдельным оператором — свежий снимок базы (гонки двух записей). */
export function entrySql(id: string, account: string): string {
  return `SELECT row_to_json(_t.*) AS _row FROM (
  SELECT e.paid, e.pay_ref, extract(epoch from e.joined_at) * 1000 AS joined_ms
    FROM yuplink.tournament_entry e WHERE ${entryOf(id, account)}
) _t;`;
}

/**
 * Неоплаченные строки к разбору: для часов турниров — зависшие и погашенные,
 * для удаления черновика — ВСЕ его неоплаченные (и свежие: попытка могла
 * упасть, заплатив, а каскад стёр бы её строку вместе с платой). С ценой,
 * ключом и кошельком попытки и признаком «турнир ещё открыт» (у открытого
 * строку доводят, у закрытого — плату возвращают). Читать с wrapJson.
 */
export function staleSql(only?: string): string {
  return `SELECT e.tournament_id AS id, e.account_id AS account, e.price, e.pay_ref, e.pay_wallet,
       EXISTS (SELECT 1 FROM yuplink.tournament t
                WHERE t.id = e.tournament_id AND ${openWhere(true)}) AS open
  FROM yuplink.tournament_entry e
 WHERE NOT e.paid AND ${only ? `e.tournament_id = ${sqlStr(only)}` : DUE}
 ORDER BY e.joined_at
 LIMIT 50`;
}

const seen = (table: string, where: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.${table} WHERE ${where})`;
const ledger = (table: string, kind: string) => (key: string) =>
  seen(table, `kind = ${sqlStr(kind)} AND ref = ${sqlStr(key)}`);
/** Ключ операции в raid_backpack_op (pay-once.payOp). */
const op = (key: string) => seen("raid_backpack_op", `op = ${sqlStr(`pay:${key}`)}`);
const res = [ledger("res_ledger", TOUR_FEE_KIND), ledger("res_ledger", TOUR_FEE_REFUND_KIND)];
const either =
  (a: (key: string) => string, b: (key: string) => string) =>
  (key: string): string =>
    `(${a(key)} OR ${b(key)})`;

/**
 * Где строка цены оставляет след по ключу: списание (ключ строки) и возврат
 * (`ключ:back`). Ресурсы, токен — журналы res_move, acc_move; энергия и товар —
 * ключи операции (плата keyed, pay-once). Лайков здесь нет: их списание ключа не
 * помнит. Строка «в билетах» с 20.10.2026 платится золотом ×500 тем же ключом
 * (§8.61) — след в res_ledger; запись, оплаченная до выката, — в ticket_ledger.
 */
const TRAIL: Partial<Record<TourEntryPrice["resource"], ReadonlyArray<(key: string) => string>>> = {
  gold: res,
  stone: res,
  wood: res,
  diamonds: res,
  tickets: [
    either(res[0], ledger("ticket_ledger", "building")),
    either(res[1], ledger("ticket_ledger", "raid_reward")),
  ],
  token: [ledger("acc_ledger", "acc_spend"), ledger("acc_ledger", "acc_reward")],
  energy: [op, op],
  item: [op, op],
};

/** Видно ли списание строки цены по ключу. */
export const hasTrail = (p: TourEntryPrice): boolean => TRAIL[p.resource] !== undefined;

/**
 * Журналы платы попытки: по строке цены — списана ли (s) и возвращена ли (b)
 * под ключом `${ref}:${i}:${resource}` (как в payResources). null — по журналу
 * не видно. Ответ: { s: [...], b: [...] }.
 */
export function evidenceSql(price: readonly TourEntryPrice[], ref: string): string {
  const s: string[] = [];
  const b: string[] = [];
  price.forEach((p, i) => {
    const key = `${ref}:${i}:${p.resource}`;
    const t = TRAIL[p.resource];
    s.push(t ? t[0](key) : "NULL::boolean");
    b.push(t ? t[1](`${key}:back`) : "NULL::boolean");
  });
  return `SELECT row_to_json(_t.*) AS _row FROM (
  SELECT json_build_array(${s.join(",\n    ")}) AS s,
         json_build_array(${b.join(",\n    ")}) AS b
) _t;`;
}
