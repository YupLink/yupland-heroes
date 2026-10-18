// Билеты: единая точка движения средств.
//
// Раньше баланс НЕ хранился — он пересчитывался на лету из ~12 таблиц
// (computeTickets), из-за чего между «проверил хватает» и «списал» можно было
// влезть дважды, а экран показывал устаревшее число. Теперь источник истины —
// yuplink.ticket_ledger + yuplink.ticket_balance, а движение идёт через
// SQL-функцию ticket_move: она блокирует строку баланса, не пускает в минус
// и не применяет одну и ту же операцию дважды (по паре kind+ref).
//
// Таблицы-факты (ticket_purchases, chip_pack_grants, …) остаются как история
// «что именно произошло» — но баланс из них больше не выводится.
import { pg, sb } from "../db/pg";

/** Виды операций. Держим списком, чтобы в леджере не расползались строки. */
export type TicketKind =
  // начисления
  | "purchase" // покупка билетов за токены
  | "nft_claim" // клейм за NFT (ticket_events)
  | "referral" // приглашённый друг
  | "task" // выполненное задание
  | "mining" // майнинг слотами
  | "collection_farm" // ферма коллекции
  | "market_sale" // продажа фишки на маркете
  | "admin_grant" // ручное начисление админом
  | "raid_reward" // награда за цель рейда (топ по урону)
  | "refund" // возврат
  | "migration" // перенос старого баланса (разовый)
  // списания
  | "redemption" // участие в платном розыгрыше
  | "like_purchase" // покупка лайков
  | "chip_pack" // пак фишек
  | "energy_pack" // энергопак
  | "craft" // крафт фишки
  | "mining_slot" // открытие слота майнинга
  | "university_slot" // место под обучение фишки в университете
  | "market_buy" // покупка на маркете
  | "mint_fee" // комиссия за минт NFT
  | "building" // постройка на карте рейда
  | "home_castle"; // переселение основного замка (ратуша), 5 билетов

/** account_id кошелька: он же ключ баланса (все sister-кошельки делят один). */
export async function ticketAccountId(wallet: string): Promise<string | null> {
  const row = (await pg.users.findOne({ wallet })) as {
    account_id?: string | null;
    telegram_id?: number | null;
  } | null;
  if (row?.account_id) return row.account_id;
  const { resolveAccountId } = await import("./user-claims-core");
  // Без telegram_id резолвер заводит сиротский аккаунт — билеты уедут на счёт,
  // которого игрок не увидит.
  return (await resolveAccountId({ wallet, telegram_id: row?.telegram_id ?? null })) ?? null;
}

export type MoveResult = { balance: number; applied: boolean };

/**
 * Изменить баланс билетов. delta > 0 — начислить, < 0 — списать.
 * Списание сверх баланса кидает ошибку «Не хватает билетов».
 *
 * ref — ключ идемпотентности: повторный вызов с той же парой (kind, ref)
 * ничего не изменит и вернёт applied=false. Передавайте туда id платежа,
 * id клейма, id покупки — всё, что однозначно опознаёт операцию.
 */
/**
 * Записано ли уже движение с такой парой (kind, ref).
 *
 * Нужно перед возвратом: транспорт БД повторяет запрос по таймауту, и ошибка
 * не значит «не сделано». Возвращать, не спросив, значит иногда дарить товар.
 */
export async function ticketMoveApplied(kind: TicketKind, ref: string): Promise<boolean> {
  const row = await pg.ticketLedger.findFirst({ kind, ref });
  return !!row;
}

export async function moveTickets(opts: {
  wallet: string;
  delta: number;
  kind: TicketKind;
  ref?: string | null;
}): Promise<MoveResult> {
  const account = await ticketAccountId(opts.wallet);
  if (!account) throw new Error("Не найден аккаунт для кошелька");
  const { data, error } = await sb.rpc("ticket_move", {
    p_account: account,
    p_delta: opts.delta,
    p_kind: opts.kind,
    p_ref: opts.ref ?? null,
    p_wallet: opts.wallet,
  });
  if (error) {
    const msg = String(error.message ?? "");
    const m = msg.match(/not_enough_tickets:([\d.]+):([\d.]+)/);
    if (m) {
      throw new Error(
        `Не хватает билетов: нужно ${Number(m[2]).toFixed(2)}, есть ${Number(m[1]).toFixed(2)}`,
      );
    }
    throw new Error(msg || "Не удалось изменить баланс билетов");
  }
  const row = (data as Array<{ balance: number; applied: boolean }> | null)?.[0];
  return { balance: Number(row?.balance ?? 0), applied: !!row?.applied };
}

/** Текущий баланс билетов по кошельку (общий для всех sister-кошельков). */
export async function ticketBalanceOf(wallet: string): Promise<number> {
  const account = await ticketAccountId(wallet);
  if (!account) return 0;
  const { data } = await pg.ticketBalance
    .raw()
    .select("balance")
    .eq("account", account)
    .maybeSingle();
  return Number((data as { balance?: number } | null)?.balance ?? 0);
}
