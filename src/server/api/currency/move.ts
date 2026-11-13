// Единый ресурсный счёт: движение средств и чтение баланса.
//
// Источник правды — yuplink.acc_ledger, писатель ровно один: SQL-функция
// acc_move. Она выстраивает параллельные операции в очередь по аккаунту, не
// пускает баланс в минус и не применяет одну операцию дважды (по паре
// kind+ref). Ключ операции обязателен: транспорт БД ретраит запрос по
// таймауту, и безымянное движение задвоилось бы молча.
//
// Не путать с currency-ledger.ts: там ЗЕРКАЛО (currency_ledger), которое
// триггеры наполняют постфактум, и его сумма — очередь на вывод, а не баланс.
import { pg, sb } from "../../db/pg";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../chips-utils";

/** Виды движений по счёту. Списком — чтобы в леджере не расползались строки. */
export type AccKind =
  | "acc_deposit" // пополнение с кошелька
  | "acc_stars" // пополнение звёздами Telegram (внутренний ресурс)
  | "acc_reward" // награда, переехавшая на счёт из очереди выплат
  | "acc_spend" // трата внутри игры
  | "acc_refund" // возврат после неудачной выдачи
  | "acc_withdraw" // вывод на кошелёк
  | "acc_adjust"; // ручная правка владельцем, пояснение обязательно в ref

export type AccMoveResult = { balance: number; applied: boolean };

export type AccBalanceRow = { token: string; balance: number };

/** account_id кошелька — ключ счёта, общий для всех sister-кошельков. */
export async function accAccountId(wallet: string): Promise<string | null> {
  const row = (await pg.users.findOne({ wallet })) as {
    account_id?: string | null;
    telegram_id?: number | null;
  } | null;
  if (row?.account_id) return row.account_id;
  const { resolveAccountId } = await import("../user-claims-core");
  // ТГ передаём обязательно: без него резолвер заводит СИРОТСКИЙ аккаунт, и
  // деньги одного человека расползаются по двум счетам. В проде так уже
  // расщепилось пять телеграмов.
  return (
    (await resolveAccountId({
      wallet,
      telegram_id: row?.telegram_id ?? null,
    })) ?? null
  );
}

/** Человеческий текст вместо машинной ошибки из plpgsql. */
export function humanizeAccError(raw: string): string {
  const notEnough = raw.match(/not_enough_currency:([^:]+):([\d.-]+):([\d.-]+)/);
  if (notEnough) {
    return `Не хватает ${notEnough[1]}: нужно ${Number(notEnough[3])}, есть ${Number(notEnough[2])}`;
  }
  const unknownToken = raw.match(/unknown_token:(\S+)/);
  if (unknownToken) return `Токен ${unknownToken[1]} не заведён в реестре`;
  const fractional = raw.match(/fractional_not_allowed:([^:]+):/);
  if (fractional) return `${fractional[1]} принимается только целыми числами`;
  if (/unknown_account:/.test(raw)) return "У кошелька нет аккаунта — сначала войди заново";
  // Кошелёк со ссылки «Короны» (buckwheat-04): выводится введённое с кошелька и до +10 %.
  const own = raw.match(/withdraw_own_limit:(\d+)/);
  if (own) {
    const left = Number(own[1]);
    return left < 1
      ? "Вывод исчерпан: выводятся DARAI, введённые с кошелька, и до +10 % сверху"
      : `Можно вывести ещё ${left.toLocaleString("ru-RU")} DARAI — введённое с кошелька и до +10 % сверху`;
  }
  // Лимит вывода DARAI в месяц (wd-01/03): withdraw_limit:<сколько ещё можно>:<лимит аккаунта>.
  const limit = raw.match(/withdraw_limit:(\d+)(?::(\d+))?/);
  if (limit) {
    const left = Number(limit[1]);
    const cap = (Number(limit[2] ?? 10_000_000) / 1_000_000).toLocaleString("ru-RU", {
      maximumFractionDigits: 1,
    });
    return left < 1
      ? `Ты достиг лимита вывода в этом месяце — на твой аккаунт ${cap} млн DARAI в месяц`
      : `В этом месяце можно вывести ещё ${left.toLocaleString("ru-RU")} DARAI — лимит аккаунта ${cap} млн`;
  }
  if (/holder_darai_withdraw:/.test(raw)) {
    return "Часть DARAI пришла из NFT-холдера — повтори вывод: она выйдет через 7–30 дней с комиссией 5 %";
  }
  if (/ref_refunded:/.test(raw)) {
    return "По этой операции уже был возврат — начни покупку заново";
  }
  const used = raw.match(/tx_already_used:(\S+)/);
  if (used) return "Эта квитанция уже зачтена — по ней товар выдан";
  return raw || "Не удалось изменить баланс счёта";
}

/**
 * Изменить баланс счёта. delta > 0 — зачислить, < 0 — списать.
 *
 * ref — ключ идемпотентности, обязателен. Повторный вызов с той же парой
 * (kind, ref) ничего не изменит и вернёт applied=false. Это не ошибка, а
 * нормальный повтор: ретрай, второй клик, догоняющий крон.
 */
export async function accMove(opts: {
  wallet: string;
  token: string;
  delta: number;
  kind: AccKind;
  ref: string;
  accountId?: string;
}): Promise<AccMoveResult> {
  const account = opts.accountId ?? (await accAccountId(opts.wallet));
  if (!account) throw new Error("Не найден аккаунт для кошелька");
  const { data, error } = await sb.rpc("acc_move", {
    p_account: account,
    p_token: opts.token,
    p_delta: opts.delta,
    p_kind: opts.kind,
    p_ref: opts.ref,
    p_wallet: opts.wallet,
  });
  if (error) throw new Error(humanizeAccError(String(error.message ?? "")));
  const row = (data as Array<{ balance: number; applied: boolean }> | null)?.[0];
  return { balance: Number(row?.balance ?? 0), applied: !!row?.applied };
}

/** Баланс одного токена на счёте. */
export async function accBalance(wallet: string, token: string): Promise<number> {
  const account = await accAccountId(wallet);
  if (!account) return 0;
  const rows = (await mcpExec(
    `SELECT COALESCE(sum(delta), 0) AS balance FROM yuplink.acc_ledger
      WHERE account_id = ${sqlStr(account)} AND token = ${sqlStr(token)};`,
    { wrapJson: true },
  )) as Array<{ balance: string }>;
  return Number(rows?.[0]?.balance ?? 0);
}

/** Все ненулевые балансы счёта — для витрин и админки. */
export async function accBalances(wallet: string): Promise<AccBalanceRow[]> {
  const account = await accAccountId(wallet);
  if (!account) return [];
  return accBalancesByAccount(account);
}

/** То же, но когда аккаунт уже известен (админка смотрит чужой счёт). */
export async function accBalancesByAccount(account: string): Promise<AccBalanceRow[]> {
  const rows = (await mcpExec(
    `SELECT token, sum(delta) AS balance FROM yuplink.acc_ledger
      WHERE account_id = ${sqlStr(account)}
      GROUP BY token HAVING sum(delta) <> 0 ORDER BY token;`,
    { wrapJson: true },
  )) as Array<{ token: string; balance: string }>;
  return (rows ?? []).map((r) => ({ token: r.token, balance: Number(r.balance) }));
}
