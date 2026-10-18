// Движения внутреннего счёта «пул карты» (yuplink.darai_pool_move).
//
// Остаток пула = сумма движений. Пополняет его только кошелёк коллекции
// (darai_collection.near), тратит — карта, закладывая DARAI под свои объекты.
//
// ПОЧЕМУ ТУТ СТОЛЬКО ПРО ИДЕМПОТЕНТНОСТЬ. Транспорт к базе (mcpClient) сам
// повторяет запрос при обрыве SSE — и это правильно, иначе игрок ловит «pool
// is closed» на любой операции. Но повтор пишущего запроса уходит ВСЛЕПУЮ:
// первая попытка вставила строку, ответ потерялся, повтор упёрся в ON CONFLICT
// и вернул НОЛЬ строк. Код, который читает ноль как «занято кем-то другим»,
// уже дважды ронял выдачу (паки за введённые NFT, сбор добычи). Поэтому в
// строку кладётся op_id ЭТОГО вызова, а решение принимается по факту наличия
// строки, а не по числу вставленных.
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

export type PoolMoveKind =
  | "collection_deposit"
  | "map_reserve"
  | "map_release"
  // Трата игрока НА КАРТЕ (маркет-постройка, портал/дверь, апгрейд постройки —
  // всё за DARAI): пул карты растёт на сумму траты. Списание со счёта игрока
  // делает acc_move; сюда пишем «счётчик», а не движение денег.
  | "player_spend"
  | "adjust";

/** Ключ строки для конкретного вида. Один объект карты — одна бронь и одно
 *  снятие: ref у них разный, иначе снятие не влезло бы в UNIQUE(ref). */
export function poolRef(kind: PoolMoveKind, ref: string): string {
  return `${kind}:${ref}`;
}

/** Числа приезжают из numeric строками — чтобы не терять копейки на пути. */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type PoolTotals = {
  /** Остаток пула = внесено коллекцией − заложено под карту (+ правки). */
  reserved: number;
  /** Всего внесено коллекцией за всё время. */
  deposited: number;
  /** Чисто заложено под объекты карты: брони минус снятые брони. */
  spent: number;
  /** Сколько всего движений — чтобы админка видела, что счёт живой. */
  moves: number;
};

export async function poolTotals(pool = "map"): Promise<PoolTotals> {
  const rows = (await mcpExec(
    `SELECT COALESCE(sum(amount), 0)::text AS reserved,
            COALESCE(sum(amount) FILTER (WHERE kind = 'collection_deposit'), 0)::text
              AS deposited,
            COALESCE(-sum(amount) FILTER (WHERE kind IN ('map_reserve', 'map_release')), 0)::text
              AS spent,
            count(*)::int AS moves
       FROM yuplink.darai_pool_move
      WHERE pool = ${sqlStr(pool)};`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>> | null;
  const r = rows?.[0] ?? {};
  return {
    reserved: num(r.reserved),
    deposited: num(r.deposited),
    spent: num(r.spent),
    moves: num(r.moves),
  };
}

/** Что лежит по этому ключу: сумма движения и чей op_id его занял. */
export async function poolMoveByRef(
  ref: string,
): Promise<{ amount: number; opId: string } | null> {
  const rows = (await mcpExec(
    `SELECT amount::text AS amount, COALESCE(op_id, '') AS op_id
       FROM yuplink.darai_pool_move WHERE ref = ${sqlStr(ref)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<Record<string, unknown>> | null;
  const r = rows?.[0];
  return r ? { amount: num(r.amount), opId: String(r.op_id ?? "") } : null;
}

/**
 * Вставка движения с ключом `ref`. Повтор с тем же ключом НЕ пишет вторую
 * строку и не меняет первую.
 *
 * `DO UPDATE SET op_id = m.op_id` строку не меняет, но заставляет RETURNING
 * отдать существующий op_id: без него повтор получал пустой ответ и врал.
 *
 * Возвращает `inserted` — эта ли попытка завела строку, и `opId` того, кто её
 * реально занял (нужен вызывающему, чтобы отличить свой повтор от чужой брони).
 */
export async function insertPoolMove(o: {
  pool?: string;
  kind: PoolMoveKind;
  amount: number;
  ref: string;
  note?: string;
}): Promise<{ inserted: boolean; opId: string }> {
  const opId = `dpm_${nanoid(12)}`;
  const rows = (await mcpExec(
    `INSERT INTO yuplink.darai_pool_move AS m (id, pool, kind, amount, ref, note, op_id)
       VALUES (${sqlStr(`dp_${nanoid(12)}`)}, ${sqlStr(o.pool ?? "map")},
               ${sqlStr(o.kind)}, ${Number(o.amount).toFixed(8)}, ${sqlStr(o.ref)},
               ${o.note ? sqlStr(o.note.slice(0, 500)) : "NULL"}, ${sqlStr(opId)})
       ON CONFLICT (ref) DO UPDATE SET op_id = m.op_id
       RETURNING m.op_id AS op_id;`,
    { wrapJsonCte: true },
  )) as Array<{ op_id?: string }> | null;

  const holder = String(rows?.[0]?.op_id ?? "");
  // Ноль строк — не «занято»: так выглядит и потерянный ответ на нашей же
  // вставке. Смотрим, кто по факту держит ключ.
  if (!holder) {
    const existing = await poolMoveByRef(o.ref);
    return { inserted: existing?.opId === opId, opId: existing?.opId ?? "" };
  }
  return { inserted: holder === opId, opId: holder };
}

/**
 * Снятие брони: сумма берётся из САМОЙ брони, а не из аргумента.
 *
 * Иначе снятие «на глазок» вернуло бы в пул больше, чем оттуда взяли, — и
 * счёт разошёлся бы с картой на ровном месте. Если брони нет, вставлять
 * нечего: `INSERT ... SELECT` из пустого источника не пишет ничего.
 */
export async function insertPoolRelease(o: {
  pool?: string;
  reserveRef: string;
  releaseRef: string;
  note?: string;
}): Promise<{ inserted: boolean; opId: string }> {
  const opId = `dpm_${nanoid(12)}`;
  const rows = (await mcpExec(
    `INSERT INTO yuplink.darai_pool_move AS m (id, pool, kind, amount, ref, note, op_id)
       SELECT ${sqlStr(`dp_${nanoid(12)}`)}, r.pool, 'map_release', -r.amount,
              ${sqlStr(o.releaseRef)}, ${o.note ? sqlStr(o.note.slice(0, 500)) : "NULL"},
              ${sqlStr(opId)}
         FROM yuplink.darai_pool_move r
        WHERE r.ref = ${sqlStr(o.reserveRef)} AND r.kind = 'map_reserve'
       ON CONFLICT (ref) DO UPDATE SET op_id = m.op_id
       RETURNING m.op_id AS op_id;`,
    { wrapJsonCte: true },
  )) as Array<{ op_id?: string }> | null;

  const holder = String(rows?.[0]?.op_id ?? "");
  if (!holder) {
    const existing = await poolMoveByRef(o.releaseRef);
    return { inserted: existing?.opId === opId, opId: existing?.opId ?? "" };
  }
  return { inserted: holder === opId, opId: holder };
}
