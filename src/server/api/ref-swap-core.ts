// Ядро обмена USDT → DARAI на Ref без проверки прав: его зовут кнопка
// казначея (ref-swap.ts) и пачка корзины подписок (energy-sub/batch.ts).
//
// Приход DARAI меряется ПО ФАКТУ, а не по котировке: из лога самой транзакции
// («Transfer N from v2.ref-finance.near to <кошелёк>» контракта DARAI) — ровно
// то, что пришло этим обменом. Лога нет — разницей баланса кошелька до и после
// (её может сдвинуть чужой перевод в те же секунды, поэтому она — запасной путь).
// Один обмен на процесс: два одновременных вызова не уйдут двумя транзакциями.
import { ensureStorageDeposit, getOperatingBalanceRaw, invalidateBalanceCache } from "../near";
import type { SignedMeta } from "../nearSafe";
import {
  quoteUsdtToDarai,
  rawToHumanNum,
  DARAI_SWAP_CONTRACT,
  DARAI_SWAP_DECIMALS,
  REF_CONTRACT,
  USDT_CONTRACT,
} from "./ref-swap-quote";
import { SWAP_MAX_USDT, SWAP_MIN_USDT, SWAP_SLIPPAGE } from "@/lib/refSwapLimits";

const SWAP_GAS = 270_000_000_000_000n; // 270 TGas — хватает на мульти-хоп своп
const SWAP_DEPOSIT = 1n; // 1 yocto для ft_transfer_call (NEP-141)

let swapInFlight = false;

export function checkSwapLimits(usdt: number): void {
  if (usdt < SWAP_MIN_USDT) throw new Error(`Минимум обмена — ${SWAP_MIN_USDT} USDT`);
  if (usdt > SWAP_MAX_USDT) {
    throw new Error(`Максимум за раз — ${SWAP_MAX_USDT} USDT (пул тонкий). Дроби сумму на части.`);
  }
}

/** Замер прихода DARAI: разница баланса, с добором пока не проиндексируется. */
async function measureReceived(beforeRaw: bigint): Promise<number> {
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    invalidateBalanceCache(DARAI_SWAP_CONTRACT);
    const afterRaw = BigInt(await getOperatingBalanceRaw(DARAI_SWAP_CONTRACT));
    const diff = afterRaw - beforeRaw;
    if (diff > 0n) return rawToHumanNum(diff.toString(), DARAI_SWAP_DECIMALS);
  }
  return 0;
}

type Outcome = { receipts_outcome?: Array<{ outcome?: { executor_id?: string; logs?: string[] } }> };

/**
 * Сколько USDT Ref реально взял — ft_transfer_call возвращает это числом в
 * SuccessValue. "0" — обмен откатился и USDT вернулись: статус всё равно
 * «успех», поэтому без этой проверки чужой приход DARAI засчитался бы обменом.
 */
export function usdtUsedRaw(outcome: unknown): bigint | null {
  const sv = (outcome as { status?: { SuccessValue?: unknown } } | null)?.status?.SuccessValue;
  if (typeof sv !== "string" || sv === "") return null;
  try {
    return BigInt(String(JSON.parse(Buffer.from(sv, "base64").toString("utf8"))));
  } catch {
    return null;
  }
}

/** Сколько DARAI пришло от Ref на кошелёк — по логам транзакции. 0 — лога нет. */
export function receivedFromLogs(outcome: unknown, receiver: string): number {
  const re = new RegExp(`^Transfer (\\d+) from ${REF_CONTRACT.replace(/\./g, "\\.")} to (\\S+)$`);
  let raw = 0n;
  for (const r of (outcome as Outcome)?.receipts_outcome ?? []) {
    if (r.outcome?.executor_id !== DARAI_SWAP_CONTRACT) continue;
    for (const log of r.outcome.logs ?? []) {
      const m = re.exec(log);
      if (m && m[2] === receiver) raw += BigInt(m[1]);
    }
  }
  return raw > 0n ? rawToHumanNum(raw.toString(), DARAI_SWAP_DECIMALS) : 0;
}

/**
 * Обменять usdtHuman USDT на DARAI. received = 0 — транзакция ушла, приход не
 * виден. beforeSign зовётся после подписи и до отправки, с хэшем, nonce и
 * байтами: всё, что упало раньше, — гарантированно без транзакции (пачка
 * подписок пишет здесь «отправляется» — по этим данным её разберёт batch-heal).
 */
export async function swapUsdtToDaraiCore(
  usdtHuman: number,
  beforeSign?: (hash: string, meta: SignedMeta) => Promise<void>,
): Promise<{ hash: string; received: number }> {
  checkSwapLimits(usdtHuman);
  if (swapInFlight) throw new Error("Обмен уже выполняется — подожди завершения");
  swapInFlight = true;
  try {
    const quote = await quoteUsdtToDarai(usdtHuman, SWAP_SLIPPAGE);
    const usdtBal = BigInt(await getOperatingBalanceRaw(USDT_CONTRACT));
    if (usdtBal < BigInt(quote.usdtRaw)) {
      throw new Error(
        `На кошельке недостаточно USDT: есть ${rawToHumanNum(usdtBal.toString(), 6)}, ` +
          `нужно ${usdtHuman}`,
      );
    }
    await ensureStorageDeposit(DARAI_SWAP_CONTRACT, process.env.NEAR_SIGNER_ACCOUNT_ID!);
    await ensureStorageDeposit(REF_CONTRACT, process.env.NEAR_SIGNER_ACCOUNT_ID!);

    invalidateBalanceCache(DARAI_SWAP_CONTRACT);
    const beforeRaw = BigInt(await getOperatingBalanceRaw(DARAI_SWAP_CONTRACT));
    const msg = JSON.stringify({ force: 0, actions: quote.actions });
    // Свой подписант (nearSafe): хэш и байты известны до отправки, nonce не
    // пересекается с соседними переводами пачки.
    const { signAndSendSafe, functionCallAction } = await import("../nearSafe");
    const sent = await signAndSendSafe({
      receiverId: USDT_CONTRACT,
      actions: [
        functionCallAction({
          methodName: "ft_transfer_call",
          args: { receiver_id: REF_CONTRACT, amount: quote.usdtRaw, msg },
          gas: SWAP_GAS,
          deposit: SWAP_DEPOSIT,
        }),
      ],
      onSigned: async (hash, meta) => beforeSign?.(hash, meta),
    });
    const hash = sent.txHash;
    if (sent.status !== "confirmed") {
      const why = sent.errorData ? ` ${JSON.stringify(sent.errorData).slice(0, 200)}` : "";
      throw new Error(`Обмен не подтвердился (tx ${hash}): ${sent.errorMsg ?? "нет ответа"}${why}`);
    }
    if (usdtUsedRaw(sent.outcome) === 0n) throw new Error(`Обмен не состоялся: Ref вернул USDT (tx ${hash})`);
    const fromLogs = receivedFromLogs(sent.outcome, process.env.NEAR_SIGNER_ACCOUNT_ID!);
    return { hash, received: fromLogs > 0 ? fromLogs : await measureReceived(beforeRaw) };
  } finally {
    swapInFlight = false;
  }
}
