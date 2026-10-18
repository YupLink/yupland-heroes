// Запись на турнир у Арены (владелец, 04.10.2026).
//
// Участвует только записавшийся: каждый турнир — своя запись, цену записи
// ставит админ (строки как у портала, берутся все разом; пусто — бесплатно;
// по умолчанию 5 золота), плата сгорает. Очки идут с момента ОПЛАТЫ (фильтр в
// tour-sql.scoreSql по paid и joined_at); оплатил до старта — с начала турнира.
// Записаться можно на запланированный (черновик со временем начала) и на
// идущий, пока не вышло время; на черновик без времени, выплату и прошлый — нет.
//
// Цена бывает любой (токен, лайки, товар из рюкзака), поэтому одним SQL с
// res_move запись уже не сделать. Порядок: занять строку (paid=false, цена из
// базы, свой ключ платежа) → payResources → paid=true. Сорвалась плата —
// строку гасим (даже если разбор успел счесть её оплаченной), сверяем журнал
// и снимаем. Повтор (двойной тап, вторая вкладка) упирается в PK: оплаченная
// строка — «уже записан», неоплаченная свежая — «оформляется». Зависшая
// дольше 2 минут заново тем же ключом НЕ платится (лайки ключа не помнят): её
// разбирает tour-entry-settle по журналам, а запись идёт новым ключом.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { requireBetaRaid } from "../beta-raid/gate";
import { raidOwner } from "../beta-raid/owner";
import { isAdminWallet } from "../../auth";
import type { TourEntryPrice } from "@/lib/tournament/types";
import { parseEntryPrice } from "@/lib/tournament/entryPrice";
import { requireTourHere } from "./tour-gate";
import { oneRow } from "./tour-sql";
import { isoOf } from "./tour-rows";
import { claimSql, entrySql, hasTrail, paidSql, voidSql } from "./tour-entry-sql";
import {
  FEE_KINDS,
  noteFee,
  noteOutcome,
  payOrder,
  refundLines,
  takePaid,
  tourFeeRef,
  type FeePlace,
} from "./tour-entry-fee";
import { resolveStale, settleVoid } from "./tour-entry-settle";

export { openWhere } from "./tour-entry-sql";
export { tourFeeRef } from "./tour-entry-fee";

type Num = number | string | null;
type ClaimRow = {
  open: boolean;
  mine: boolean;
  paid: boolean | null;
  stale: boolean;
  price: unknown;
  pay_ref: string | null;
  pay_wallet: string | null;
  joined_ms: Num;
};
type EntryRow = { paid: boolean | null; pay_ref: string | null; joined_ms: Num };
/** price — что списали (по цене из базы); у «уже записан» его нет. */
export type JoinResult = {
  ok: true;
  joinedAt: string;
  already: boolean;
  price?: TourEntryPrice[];
};
export type JoinInput = {
  id: string;
  account: string;
  wallet: string;
  admin?: boolean;
  /** Клетка Арены: плата пишется в журнал сделок там, как у ворот и портала. */
  place?: FeePlace;
};

const run = async <T>(sql: string): Promise<T | undefined> =>
  oneRow<T>((await mcpExec(sql)) as unknown[] | null);

/** Нехватка на любой строке цены — понятным ключом; прочее (нет героя) — как есть. */
const SHORT = /не хватает|в минус|нужно \d|столько нет|not_enough/i;

/**
 * Записать аккаунт. Ошибки — ключами: 'tour.err.no_fee' (не хватает на цену —
 * записи нет), 'tour.err.not_open' (на этот турнир записаться нельзя),
 * 'tour.err.busy' (запись уже оформляется). Уже записан — ok с already: true,
 * без второй платы (даже если турнир уже закрыт для новых записей).
 * again — второй заход после разбора своей зависшей строки (без петли).
 */
export async function joinAs(o: JoinInput, again = false): Promise<JoinResult> {
  const { id, account } = o;
  const payRef = tourFeeRef(id, account, nanoid(10));
  const row = await run<ClaimRow>(claimSql({ ...o, payRef }));
  const joinedAt = isoOf(row?.joined_ms ?? null);
  if (!row || !joinedAt) {
    // Гонка двух записей: наша вставка ждала чужую и ничего не вставила, а
    // чтение того же оператора смотрит в снимок до чужого коммита. Новый
    // оператор — новый снимок.
    if (row?.open === true) return afterRace(id, account);
    throw new Error("tour.err.not_open");
  }
  // Своя строка — вставили мы или слепой повтор нашей же вставки (мост
  // повторяет запрос, первая вставка уже легла): ключ платежа в ней наш.
  const mine = row.mine || row.pay_ref === payRef;
  if (row.paid) return { ok: true, joinedAt, already: !mine, ...(mine ? { price: [] } : {}) };
  if (mine) return payAndConfirm(o, payOrder(parseEntryPrice(row.price)), payRef);
  if (!row.open) throw new Error("tour.err.not_open");
  if (!row.stale || again) throw new Error("tour.err.busy");
  // Зависшая строка другой попытки: разобрать (оплачена — отметится, откачена —
  // снимется) и записаться заново. Разбор сорвался — строка на месте, «оформляется».
  const stale = { id, account, price: row.price, pay_ref: row.pay_ref, pay_wallet: row.pay_wallet };
  await resolveStale(stale, "keep", o).catch(() => undefined);
  return joinAs(o, true);
}

async function afterRace(id: string, account: string): Promise<JoinResult> {
  const again = await run<EntryRow>(entrySql(id, account));
  const at = isoOf(again?.joined_ms ?? null);
  if (at && again?.paid) return { ok: true, joinedAt: at, already: true };
  throw new Error("tour.err.busy");
}

async function payAndConfirm(
  o: JoinInput,
  price: TourEntryPrice[],
  ref: string,
): Promise<JoinResult> {
  const { payResources } = await import("../beta-raid/resource-pay");
  try {
    await payResources(o.wallet, price, ref, FEE_KINDS);
  } catch (e) {
    noteOutcome(ref, "void");
    await revoke(o, price, ref);
    const msg = e instanceof Error ? e.message : String(e);
    throw SHORT.test(msg) ? new Error("tour.err.no_fee") : e;
  }
  noteOutcome(ref, "paid");
  const done = await run<{ joined_ms: Num }>(paidSql(o.id, o.account, ref)).catch(() => undefined);
  const at = isoOf(done?.joined_ms ?? null);
  if (!at) return confirmFailed(o, price, ref);
  noteFee(o, price, ref);
  return { ok: true, joinedAt: at, already: false, price };
}

/**
 * Плата сорвалась (payResources откатил списанное сам). Строку гасим по ключу
 * БЕЗ условия «не оплачена»: пока плата висела, разбор зависших мог засчитать
 * её «не проверить» — тогда снимаем и очки. Потом журнал: списанное по ключу и
 * не вернувшееся (откат молча не прошёл, списание легло, а ответ — нет) —
 * назад; сошлось — строку снимаем, нет — её доведут часы турниров (память
 * процесса знает, что плата откачена).
 */
async function revoke(o: JoinInput, price: TourEntryPrice[], ref: string): Promise<void> {
  try {
    await run(voidSql(o.id, o.account, ref, true));
    await settleVoid(o, ref, o.wallet, price);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.warn(`[tour] сорванную запись ${ref} не разобрали (${why}) — разберут часы турниров`);
  }
}

/**
 * Заплатил, а отметка «оплачено» не легла (ответ потерян или база моргнула).
 * Решает свежее чтение своей строки:
 * - не прочиталась — плату не трогаем: строку разберут как зависшую, а память
 *   процесса знает, что плата прошла (второй раз не спишут);
 * - ключ наш и оплачена — ответ потерялся при удачной отметке;
 * - ключ наш, не оплачена — отметку повторяем; не легла снова — как выше;
 * - строки нет (черновик удалили) или ключ в ней чужой (нашу попытку сочли
 *   зависшей и разобрали) — наша плата лишняя, возвращаем.
 */
async function confirmFailed(
  o: JoinInput,
  price: TourEntryPrice[],
  ref: string,
): Promise<JoinResult> {
  let unread = false;
  const now = await run<EntryRow>(entrySql(o.id, o.account)).catch(() => {
    unread = true;
    return undefined;
  });
  if (unread) throw new Error("tour.err.busy");
  const at = isoOf(now?.joined_ms ?? null);
  if (now && now.pay_ref === ref) {
    const done = now.paid
      ? now
      : await run<EntryRow>(paidSql(o.id, o.account, ref)).catch(() => undefined);
    const doneAt = isoOf(done?.joined_ms ?? null);
    if (!doneAt) throw new Error("tour.err.busy");
    noteFee(o, price, ref);
    return { ok: true, joinedAt: doneAt, already: false, price };
  }
  // Проверяемое — под ключом :back (повтор не удвоит), лайки — один раз на
  // процесс: разбор зависшей строки мог их уже вернуть.
  const all = takePaid(ref);
  await refundLines(o.wallet, price, ref, (p) => all || hasTrail(p));
  if (now?.paid && at) return { ok: true, joinedAt: at, already: true };
  throw new Error(now ? "tour.err.busy" : "tour.err.not_open");
}

export const joinTournament = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ q: z.number().int(), r: z.number().int(), id: z.string().min(1).max(64) }).parse(d),
  )
  .handler(async ({ data }): Promise<JoinResult> => {
    const wallet = await requireBetaRaid();
    const mapId = await requireTourHere(wallet, data.q, data.r);
    const account = await raidOwner(wallet);
    return joinAs({
      id: data.id,
      account,
      wallet,
      admin: isAdminWallet(wallet),
      place: { mapId, q: data.q, r: data.r },
    });
  });
