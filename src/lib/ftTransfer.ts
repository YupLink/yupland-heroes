// Подпись перевода токена на кошелёк проекта.
//
// Вынесено из окна пополнения DARAI, чтобы не копировать пару
// storage_deposit + ft_transfer в каждое новое место. Регистрация получателя
// идёт первым действием и обходится в 0.00125 NEAR — контракт вернёт их, если
// получатель уже зарегистрирован.
import { getSignerWallet } from "@/lib/near-connector";
import { extractTxHash } from "@/components/chips/nft-input-shared";

const STORAGE_DEPOSIT_GAS = "10000000000000";
const STORAGE_DEPOSIT_AMOUNT = "1250000000000000000000";
const FT_TRANSFER_GAS = "30000000000000";

/** Человеческая сумма → raw, без потери дробной части и без краша на дробях. */
export function toRawAmount(amountHuman: number, decimals: number): string {
  const safe = Math.min(decimals, 9);
  const [intPart, frac = ""] = amountHuman.toFixed(safe).split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return (intPart + fracPadded).replace(/^0+(?=\d)/, "") || "0";
}

/**
 * Подписать перевод и вернуть хэш квитанции.
 *
 * Кошелёк в Telegram-вебвью иногда не отдаёт хэш — тогда бросаем понятную
 * ошибку и предлагаем вставить его руками, а не оставляем игрока в тупике.
 */
export async function signFtTransfer(opts: {
  ftContract: string;
  receiverId: string;
  amountHuman: number;
  decimals: number;
  memo?: string;
}): Promise<string> {
  const wallet = await getSignerWallet();
  const outcome = await wallet.signAndSendTransactions({
    transactions: [
      {
        receiverId: opts.ftContract,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "storage_deposit",
              args: { account_id: opts.receiverId, registration_only: true },
              gas: STORAGE_DEPOSIT_GAS,
              deposit: STORAGE_DEPOSIT_AMOUNT,
            },
          },
          {
            type: "FunctionCall",
            params: {
              methodName: "ft_transfer",
              args: {
                receiver_id: opts.receiverId,
                amount: toRawAmount(opts.amountHuman, opts.decimals),
                memo: opts.memo ?? "yuplink account top-up",
              },
              gas: FT_TRANSFER_GAS,
              deposit: "1",
            },
          },
        ],
      },
    ],
  });

  const txHash = extractTxHash(outcome);
  if (!txHash) {
    throw new Error(
      "Кошелёк не вернул хэш. Открой историю кошелька, скопируй хэш перевода и вставь его в поле «Уже отправил?».",
    );
  }
  return txHash;
}
