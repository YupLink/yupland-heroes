// Зачисление пополнения по квитанции — БЕЗ слоя сервер-функции.
//
// Вынесено отдельно, потому что у зачисления теперь два входа: живой запрос
// игрока и отложенный догон (credit-wait). Держать логику внутри обработчика
// значило бы, что догону пришлось бы притворяться игроком — с его сессией,
// гейтом частоты и всем прочим.
import { pg, sb } from "../../db/pg";
import { OPERATING_WALLET } from "./treasury";
import { minDepositFor, depositAllowed } from "./limits";
import { accAccountId } from "./move";

type TokenRow = {
  symbol: string;
  ft_contract: string;
  decimals: number;
};

export type DepositApplied = {
  token: string;
  amount: number;
  applied: boolean;
  balance: number;
};

/**
 * Найти перевод и зачислить его на счёт кошелька.
 *
 * Бросает — и это важно: вызывающий сам решает, показать отказ игроку или
 * промолчать и попробовать позже. Для догона «ещё не проиндексировано» это не
 * ошибка, а «рано»; для живого запроса — повод сказать «подожди минуту».
 */
export async function applyAccountDeposit(args: {
  wallet: string;
  txHash: string;
  token: string;
}): Promise<DepositApplied> {
  const token = args.token.trim();
  const txHash = args.txHash.trim();

  if (!(await depositAllowed(token))) {
    throw new Error(`Пополнение ${token} сейчас закрыто: обязательства не покрыты резервом`);
  }

  const row = (await pg.rewardTokens.findOne({ symbol: token })) as TokenRow | null;
  if (!row) throw new Error(`Токен ${token} не заведён в реестре`);

  const account = await accAccountId(args.wallet);
  if (!account) throw new Error("Не найден аккаунт для кошелька");

  const min = await minDepositFor(token);
  const { getSisterWallets } = await import("../user-shared");
  const senders = await getSisterWallets(args.wallet);

  const { verifyFtTransfer } = await import("../../near");
  const { paidHuman, actualSender } = await verifyFtTransfer({
    txHash,
    senderAccount: senders,
    ftContract: row.ft_contract,
    expectedReceiver: OPERATING_WALLET,
    minAmountHuman: min,
    decimals: Number(row.decimals),
    expectedSymbol: token,
    forAccountDeposit: true,
  });

  // Округляем ВНИЗ и всегда до целого: счёт ведём целыми числами, а остаток
  // и так остался на кошельке проекта.
  const amount = Math.floor(paidHuman);
  if (!(amount > 0)) throw new Error(`Минимум для пополнения ${token} — ${min}`);

  const { data: res, error } = await sb.rpc("acc_deposit_apply", {
    p_account: account,
    p_wallet: actualSender,
    p_token: token,
    p_amount: amount,
    p_tx: txHash,
  });
  if (error) {
    const msg = String(error.message ?? "");
    if (/tx_already_used/.test(msg)) {
      throw new Error("Эта квитанция уже зачтена — по ней товар выдан");
    }
    throw new Error(msg || "Не удалось зачислить пополнение");
  }
  const out = (res as Array<{ balance: number; applied: boolean }> | null)?.[0];
  return {
    token,
    amount,
    applied: !!out?.applied,
    balance: Number(out?.balance ?? 0),
  };
}
