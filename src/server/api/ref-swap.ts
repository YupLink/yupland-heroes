// Обмен USDT → DARAI через Ref Finance по кнопке владельца.
//
// Продаём СВОБОДНЫЙ USDT карты (больше — отказ, assertFreeUsdt) за DARAI и зачисляем ВСЁ, что
// реально пришло, в пул карты (kind='adjust'). «Реально пришло» — по логу
// транзакции (запасной путь — разница баланса), а не котировка: сколько дал
// рынок, столько и в пул. Владельцу шлём в бота фактическую сумму.
//
// Раздел денежный → гейт requireTreasury (владелец и коллекция DARAI: пул
// карты наполняет она, и гонять заливку через владельца — лишнее звено).
// Обмен один на все процессы (аренда usdt_swap_busy в usdt-guard), внутри
// процесса режет swapInFlight, повтор зачёта в пул — идемпотентность по txHash.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireTreasury } from "../auth";
import { sendTgMessageToAdmins } from "../tg";
import { insertPoolMove, poolTotals } from "./darai-pools-move";
import { quoteUsdtToDarai, type SwapQuote } from "./ref-swap-quote";
import { SWAP_SLIPPAGE } from "@/lib/refSwapLimits";
import { checkSwapLimits, swapUsdtToDaraiCore } from "./ref-swap-core";
import { assertFreeUsdt } from "./ref-swap-free";
import { lockUsdtSwap, unlockUsdtSwap } from "./usdt-guard";

const amountSchema = (d: unknown) =>
  z.object({ usdtHuman: z.number().positive() }).parse(d);

/** Котировка для формы: сколько DARAI придёт и какое проскальзывание. */
export const adminQuoteUsdtToDarai = createServerFn({ method: "POST" })
  .inputValidator(amountSchema)
  .handler(async ({ data }): Promise<SwapQuote> => {
    requireTreasury();
    checkSwapLimits(data.usdtHuman);
    await assertFreeUsdt(data.usdtHuman);
    return quoteUsdtToDarai(data.usdtHuman, SWAP_SLIPPAGE);
  });

export type SwapResult = {
  txHash: string;
  usdtHuman: number;
  daraiReceived: number;
  poolReserved: number;
};

/** Выполнить обмен: своп на Ref → зачёт факта в пул карты → алерт в бота. */
export const adminSwapUsdtToDarai = createServerFn({ method: "POST" })
  .inputValidator(amountSchema)
  .handler(async ({ data }): Promise<SwapResult> => {
    requireTreasury();
    // Один обмен на все процессы; «свободно» — уже под арендой (usdt-guard).
    if (!(await lockUsdtSwap())) throw new Error("Уже идёт другой обмен USDT — подожди минуту");
    let swapped: { hash: string; received: number };
    try {
      await assertFreeUsdt(data.usdtHuman);
      // Своп, замер прихода — в ядре (ref-swap-core), общем с пачкой корзины подписок.
      swapped = await swapUsdtToDaraiCore(data.usdtHuman);
    } finally {
      await unlockUsdtSwap();
    }
    const { hash, received } = swapped;

    let poolReserved = (await poolTotals()).reserved;
    if (received > 0) {
      await insertPoolMove({
        pool: "map",
        kind: "adjust",
        amount: received,
        ref: `swap:${hash}`,
        note: `Ref swap ${data.usdtHuman} USDT → DARAI`,
      });
      poolReserved = (await poolTotals()).reserved;
    }

    const msgText =
      received > 0
        ? `💱 Обмен на Ref: ${data.usdtHuman} USDT → ${received.toLocaleString("ru-RU", {
            maximumFractionDigits: 2,
          })} DARAI зачислено в пул карты.\ntx: ${hash}`
        : `⚠️ Обмен ${data.usdtHuman} USDT прошёл (tx: ${hash}), но прихода DARAI на кошелёк не видно. Проверь вручную.`;
    await sendTgMessageToAdmins(msgText);

    return { txHash: hash, usdtHuman: data.usdtHuman, daraiReceived: received, poolReserved };
  });
