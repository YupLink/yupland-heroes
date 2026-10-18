// Зависшая запись на турнир: строка tournament_entry с paid=false старше
// TOUR_ENTRY_STALE. Остаётся, когда попытка оборвалась между платой и
// отметкой (процесс упал, база моргнула). Что она успела списать, видно по
// ключу попытки (tour-entry-sql.evidenceSql): ресурсы, билеты, токен — по
// журналам, энергия и товар — по ключам операции (плата keyed). Не видно
// только лайков — про них знает память процесса (tour-entry-fee).
//
// Разбор: журналы + память → «оплачено», «откачено» или «не проверить» (лайки).
// - Турнир открыт (keep): оплачено или не проверить — строку отмечаем
//   оплаченной без второго списания; откачено — гасим и довозвращаем.
// - Турнир закрыт или черновик удаляют (cancel): гасим и возвращаем всё,
//   что списано по ключу.
// Гасим ДО возврата (voidSql — CAS по ключу): живая попытка, которая ещё
// дожмёт плату, промахнётся отметкой «оплачено» и вернёт всё сама
// (tour-entry.confirmFailed). Погашенную строку снимаем, только когда журнал
// сошёлся (всё списанное вернулось); не сошёлся — строка ждёт, часы турниров
// повторят возврат. Зовут запись (свою зависшую строку — сразу), плательщик
// при сорванной плате, часы турниров (раз в минуту) и удаление черновика.
import { mcpExec } from "../../db/mcpClient";
import { parseEntryPrice } from "@/lib/tournament/entryPrice";
import type { TourEntryPrice } from "@/lib/tournament/types";
import { oneRow } from "./tour-sql";
import {
  attemptRef,
  dropSql,
  evidenceSql,
  hasTrail,
  isVoidRef,
  paidSql,
  staleSql,
  voidRef,
  voidSql,
} from "./tour-entry-sql";
import {
  noteFee,
  outcomeOf,
  payOrder,
  refundLines,
  takePaid,
  type FeePlace,
} from "./tour-entry-fee";

export type Verdict = "paid" | "void" | "unknown";
type Flags = ReadonlyArray<boolean | null>;
type Trail = { s: Flags; b: Flags };

/**
 * Итог попытки по журналам. s/b — списана ли строка и возвращена ли (null —
 * по журналу не видно); строки — в порядке оплаты (payOrder: проверяемые
 * первыми). Возврат хоть одной — плата откатывалась целиком (payResources).
 * Несписанная проверяемая — очередь на ней встала, дальше не списано ничего.
 * Все списаны — оплачено; списаны все проверяемые, а за ними лайки — не
 * проверить.
 */
export function judge(s: Flags, b: Flags): Verdict {
  if (b.some((x) => x === true)) return "void";
  if (s.some((x) => x === false)) return "void";
  return s.every((x) => x === true) ? "paid" : "unknown";
}

export type StaleEntry = {
  id: string;
  account: string;
  price: unknown;
  pay_ref: string | null;
  pay_wallet: string | null;
};
type Attempt = { id: string; account: string; pay_ref?: string | null };

const run = async <T>(sql: string): Promise<T | undefined> =>
  oneRow<T>((await mcpExec(sql)) as unknown[] | null);

const say = (e: Attempt, ref: string, what: string) =>
  console.error(`[tour] запись ${e.id}/${e.account} (${ref}): ${what}`);

/** Журналы платы; не прочитались — бросаем: без них ничего не трогаем. */
async function readTrail(price: TourEntryPrice[], ref: string): Promise<Trail> {
  const ev = await run<Trail>(evidenceSql(price, ref));
  if (!ev || !Array.isArray(ev.s) || !Array.isArray(ev.b)) {
    throw new Error("tour: журналы платы не прочитаны");
  }
  return ev;
}

/** Списано по ключу и не возвращено. */
const owedIn = (t: Trail, price: TourEntryPrice[]): number[] =>
  price.flatMap((p, i) => (hasTrail(p) && t.s[i] === true && t.b[i] !== true ? [i] : []));

/**
 * Довести погашенную попытку ref: вернуть списанное по ключу (под ключом :back
 * — повтор не удвоит), лайки — только если этот процесс сам видел плату
 * прошедшей (takePaid). Журнал сошёлся — строку `ref:void` снимаем; нет —
 * оставляем часам турниров. true — снята (или её уже нет).
 */
export async function settleVoid(
  e: Attempt,
  ref: string,
  wallet: string,
  price: TourEntryPrice[],
): Promise<boolean> {
  const before = await readTrail(price, ref);
  const owed = owedIn(before, price);
  const likes = takePaid(ref);
  await refundLines(wallet, price, ref, (p, i) => (hasTrail(p) ? owed.includes(i) : likes));
  if (owed.length > 0 && owedIn(await readTrail(price, ref), price).length > 0) {
    say(e, ref, "плата вернулась не вся — строку держим, часы турниров повторят возврат");
    return false;
  }
  await run(dropSql(e.id, e.account, voidRef(ref)));
  return true;
}

/**
 * Разобрать неоплаченную строку. ctx — запись, которая наткнулась на свою
 * строку: её кошелёк (если в строке нет) и клетка Арены для журнала сделок.
 * Журналы не прочитались — ничего не трогаем (бросаем).
 */
export async function resolveStale(
  e: StaleEntry,
  mode: "keep" | "cancel",
  ctx?: { wallet: string; place?: FeePlace },
): Promise<Verdict | null> {
  const ref = e.pay_ref ? attemptRef(e.pay_ref) : null;
  const wallet = e.pay_wallet || ctx?.wallet;
  if (!ref || !wallet) {
    say(e, String(ref), "нет ключа или кошелька попытки — разбирать нечем");
    return null;
  }
  const price = payOrder(parseEntryPrice(e.price));
  // Уже погашена (плательщиком или прошлым разбором) — только довести.
  if (isVoidRef(e.pay_ref)) return (await settleVoid(e, ref, wallet, price)) ? "void" : null;

  const ev = await readTrail(price, ref);
  const verdict = outcomeOf(ref) ?? judge(ev.s, ev.b);
  if (mode === "keep" && verdict !== "void") {
    // Второй раз не берём: плата прошла, или лайки не проверить (тогда в лог —
    // если игрок не платил, по логу видно, кому запись досталась даром; живой
    // плательщик, у которого плата сорвётся, погасит строку сам).
    if (verdict === "unknown") say(e, ref, "лайки не проверить — засчитана без второго списания");
    const done = await run<{ joined_ms: unknown }>(paidSql(e.id, e.account, ref));
    if (done?.joined_ms != null && ctx) noteFee({ wallet, place: ctx.place }, price, ref);
    return verdict;
  }
  // Сначала гасим (CAS по ключу), потом возвращаем: не погасили — строку уже
  // отметила сама попытка или разобрал другой, и возвращать не нам.
  const took = await run<{ n: number }>(voidSql(e.id, e.account, ref));
  if (!(Number(took?.n) > 0)) return verdict;
  if (mode === "cancel" && verdict === "unknown" && outcomeOf(ref) !== "paid") {
    say(e, ref, "лайки не проверить — не возвращены");
  }
  await settleVoid(e, ref, wallet, price);
  return verdict;
}

/**
 * Разобрать строки к разбору: все (часы турниров) или одного турнира (удаление
 * черновика — тогда только возврат). Ошибка одной строки не держит остальные.
 */
export async function sweepStaleEntries(only?: string): Promise<number> {
  const rows = (await mcpExec(staleSql(only), { wrapJson: true })) as Array<
    StaleEntry & { open: boolean }
  > | null;
  let n = 0;
  for (const r of rows ?? []) {
    const mode = r.open && !only ? "keep" : "cancel";
    const v = await resolveStale(r, mode).catch((err) => {
      say(
        r,
        String(r.pay_ref),
        `разбор сорвался: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    });
    if (v) n++;
  }
  return n;
}
