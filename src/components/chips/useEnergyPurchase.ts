// Покупка энергопака: билеты, $DARAI и токены экосистемы.
//
// Вынесено из EnergyPackCard, чтобы карточка осталась разметкой (≤250 строк).
// Здесь же живёт защита от повторной оплаты: подписанный перевод запоминается
// ДО серверного вызова, и покупка закрыта, пока он не стал энергией.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getSignerWallet } from "@/lib/near-connector";
import {
  buyEnergyPackViaTickets,
  buyEnergyPackViaDarai,
  buyEnergyPackViaToken,
} from "@/server/api/energyPacks";
import { buyEnergyPackFromAccount } from "@/server/api/energy-packs-account-pay";
import { buyEnergyPackForUsd } from "@/server/api/energy-packs-usd-pay";
import type { UsdToken } from "@/lib/usdTariff";
import { ACC_BALANCES_KEY } from "@/lib/hooks/useAccountBalances";
import { PENDING_KEY, readPendingPay, startPendingPay, clearPendingPay } from "./energyPending";
import { humanError } from "@/lib/humanError";

type TokenPick = { symbol: string; ftContract: string; amount: number; decimals: number };

/**
 * Ключ нажатия. Целевой телефон владельца — Xiaomi 13T в вебвью Telegram, где
 * `crypto.randomUUID` отсутствует, поэтому берём его только если он есть.
 */
function newOpId(): string {
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof c?.randomUUID === "function") return c.randomUUID().replace(/-/g, "").slice(0, 24);
  return `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function useEnergyPurchase(pack: {
  id: string;
  priceDarai: number | null;
  token: TokenPick | null;
}) {
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-energy"] });
    qc.invalidateQueries({ queryKey: ["my-tickets"] });
    qc.invalidateQueries({ queryKey: ["my-darai-balance"] });
    qc.invalidateQueries({ queryKey: ["my-darai-deposits"] });
    qc.invalidateQueries({ queryKey: ["energy-packs-public"] });
    qc.invalidateQueries({ queryKey: ["boss-active"] });
    qc.invalidateQueries({ queryKey: ACC_BALANCES_KEY });
    // «Мои NFT» показывает тот же баланс — обновляем и его, иначе там
    // висит цифра до покупки, и кажется, что деньги не списались.
    qc.invalidateQueries({ queryKey: ["my-payouts"] });
  };

  const [open, setOpen] = useState(false);
  // Оплата в пути: пока прошлый перевод не стал энергией, покупку не пускаем —
  // иначе люди платят второй раз, а цена уже поднялась на ступень.
  const pendingPay = useQuery({
    queryKey: PENDING_KEY,
    queryFn: () => readPendingPay(),
    staleTime: Infinity,
  });
  // Плашка «зачисляем» — предупреждение, а НЕ блокировка: заблокированные
  // кнопки со спиннером выглядели как «оплата висит и кошелёк не открывается».
  const paying = !!pendingPay.data;

  const buyTk = useMutation({
    mutationFn: () => buyEnergyPackViaTickets({ data: { packId: pack.id } }),
    onSuccess: (r) => {
      toast.success(`+${r.energyAdded} энергии`);
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const buyOnChain = async (
    ftContract: string,
    amountHuman: number,
    decimals: number,
    send: (txHash: string) => Promise<{ energyAdded: number }>,
    payLabel: string,
  ) => {
    const w = await getSignerWallet();
    const [ip, fp = ""] = String(amountHuman).split(".");
    const frac = (fp + "0".repeat(decimals)).slice(0, decimals);
    const rawAmount = (
      BigInt(ip || "0") * 10n ** BigInt(decimals) +
      BigInt(frac || "0")
    ).toString();
    const result = await w.signAndSendTransactions({
      transactions: [
        {
          receiverId: ftContract,
          actions: [
            {
              type: "FunctionCall",
              params: {
                methodName: "storage_deposit",
                args: { account_id: "darai_gdrop.near", registration_only: true },
                gas: "10000000000000",
                deposit: "1250000000000000000000",
              },
            },
            {
              type: "FunctionCall",
              params: {
                methodName: "ft_transfer",
                args: {
                  receiver_id: "darai_gdrop.near",
                  amount: rawAmount,
                  memo: `buy energy pack ${pack.id}`,
                },
                gas: "30000000000000",
                deposit: "1",
              },
            },
          ],
        },
      ],
    });
    const arr = result as Array<{
      transaction?: { hash?: string };
      transaction_outcome?: { id?: string };
    }>;
    const last = arr[arr.length - 1] ?? arr[0];
    const txHash = last?.transaction?.hash ?? last?.transaction_outcome?.id;
    if (!txHash) throw new Error("Не удалось получить хэш транзакции");
    // Помним оплату ДО серверного вызова: если он не докрутит, плашка
    // «Зачисляем оплату…» сама добьёт зачёт. Ошибка вызова тоже снимает
    // отметку — иначе она застревала и мешала следующей покупке.
    startPendingPay(qc, { packId: pack.id, txHash, label: payLabel });
    try {
      return await send(txHash);
    } finally {
      clearPendingPay(qc);
    }
  };

  const buyDr = useMutation({
    // Цена берётся из выбранной ступени: pack.priceDarai — старое одиночное
    // поле, из-за него витрина показывала 500 000, а кошелёк просил миллион.
    mutationFn: (stepPrice?: number) => {
      const price = stepPrice ?? pack.priceDarai;
      if (price == null) throw new Error("Цена в DARAI не задана");
      return buyOnChain(
        "darai.tkn.near",
        price,
        18,
        (txHash) => buyEnergyPackViaDarai({ data: { packId: pack.id, txHash } }),
        `${price} $DARAI`,
      );
    },
    onSuccess: (r) => {
      toast.success(`+${r.energyAdded} энергии`);
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  const buyTok = useMutation({
    // Платим ИМЕННО выбранным токеном: раньше всегда брался единственный
    // старый токен пака, и за любой вариант списывался он.
    mutationFn: (pick?: {
      symbol: string;
      ftContract: string;
      amount: number;
      decimals: number;
    }) => {
      const t = pick ?? pack.token;
      if (!t) throw new Error("Цена в токене не задана");
      const symbol = "symbol" in t ? t.symbol : undefined;
      return buyOnChain(
        t.ftContract,
        t.amount,
        t.decimals,
        (txHash) =>
          buyEnergyPackViaToken({ data: { packId: pack.id, txHash, tokenSymbol: symbol } }),
        `${t.amount} ${symbol ?? "токенов"}`,
      );
    },
    onSuccess: (r) => {
      toast.success(`+${r.energyAdded} энергии`);
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Оплата с ресурсного счёта: блокчейн не участвует, поэтому ни подписи, ни
  // «оплаты в пути» здесь нет. Ключ нажатия генерим ОДИН раз на клик — иначе
  // повтор запроса по таймауту списал бы второй раз.
  const buyAcc = useMutation({
    mutationFn: (pick: { symbol: string; payKind?: "token" | "darai" }) =>
      buyEnergyPackFromAccount({
        data: {
          packId: pack.id,
          symbol: pick.symbol,
          payKind: pick.payKind ?? "token",
          opId: newOpId(),
        },
      }),
    onSuccess: (r) => {
      toast.success(`+${r.energyAdded} энергии · со счёта ${r.spent} ${r.token}`);
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  // Тариф в $: USDT / DARAI / звёзды со счёта по курсу (lib/usdTariff.ts).
  const buyUsd = useMutation({
    mutationFn: (pick: { token: UsdToken; shown: number }) =>
      buyEnergyPackForUsd({
        data: { packId: pack.id, token: pick.token, shown: pick.shown, opId: newOpId() },
      }),
    onSuccess: (r) => {
      toast.success(`+${r.energyAdded} энергии · со счёта ${r.spent.toLocaleString("ru-RU")} ${r.token}`);
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => {
      toast.error(humanError(e));
      // Цена могла сдвинуться (курс, ступень) — показать новую.
      qc.invalidateQueries({ queryKey: ["energy-packs-public"] });
    },
  });

  const busy =
    buyTk.isPending || buyDr.isPending || buyTok.isPending || buyAcc.isPending || buyUsd.isPending;
  return { buyTk, buyDr, buyTok, buyAcc, buyUsd, busy, paying, open, setOpen };
}
