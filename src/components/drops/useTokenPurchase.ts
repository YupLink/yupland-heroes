import { useMutation, useQueryClient } from "@tanstack/react-query";
import { purchaseTicketsViaToken } from "@/server/api/user-shop";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";

const FT_TRANSFER_GAS = "30000000000000";
const STORAGE_DEPOSIT_GAS = "10000000000000";
const STORAGE_DEPOSIT_AMOUNT = "1250000000000000000000";
const TOKEN_BURN_RECEIVER = "darai_gdrop.near";

export function useTokenPurchase() {
  const t = useT();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (offer: {
      id: string;
      ftContract: string | null;
      decimals: number | null;
      priceToken: number | null;
      totalPriceToken?: number;
      paymentToken: string | null;
      quantity: number;
    }) => {
      if (!offer.ftContract || offer.decimals == null || !offer.priceToken) {
        throw new Error("Оффер не сконфигурирован");
      }
      const qty = Math.max(1, Math.floor(offer.quantity));
      const { getConnector } = await import("@/lib/near-connector");
      const connector = await getConnector();
      if (!connector) throw new Error("NEAR-кошелёк не подключён");
      let w;
      try {
        const conn = await connector.getConnectedWallet();
        w = conn.wallet;
      } catch {
        throw new Error("Сессия кошелька не активна — переподключи");
      }
      const amountHuman = offer.totalPriceToken ?? offer.priceToken * qty;
      if (!Number.isFinite(amountHuman) || amountHuman <= 0) throw new Error("Цена токена недоступна");
      const [whole, fraction = ""] = String(amountHuman).split(".");
      if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > offer.decimals) throw new Error("Цена токена имеет неподдерживаемую точность");
      const rawAmount = (BigInt(whole) * 10n ** BigInt(offer.decimals) + BigInt((fraction + "0".repeat(offer.decimals)).slice(0, offer.decimals) || "0")).toString();
      const result = await w.signAndSendTransactions({
        transactions: [
          {
            receiverId: offer.ftContract,
            actions: [
              {
                type: "FunctionCall",
                params: {
                  methodName: "storage_deposit",
                  args: {
                    account_id: TOKEN_BURN_RECEIVER,
                    registration_only: true,
                  },
                  gas: STORAGE_DEPOSIT_GAS,
                  deposit: STORAGE_DEPOSIT_AMOUNT,
                },
              },
              {
                type: "FunctionCall",
                params: {
                  methodName: "ft_transfer",
                  args: {
                    receiver_id: TOKEN_BURN_RECEIVER,
                    amount: rawAmount,
                    memo: `buy tickets ${offer.id} x${qty}`,
                  },
                  gas: FT_TRANSFER_GAS,
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
      const txHash =
        last?.transaction?.hash ?? last?.transaction_outcome?.id ?? null;
      if (!txHash) throw new Error("Не удалось получить хэш транзакции");
      try {
        window.localStorage.setItem(
          "pending_ticket_purchase",
          JSON.stringify({
            offerId: offer.id,
            txHash,
            quantity: qty,
            paymentToken: offer.paymentToken,
            at: Date.now(),
          })
        );
      } catch {
        /* ignore */
      }
      return purchaseTicketsViaToken({
        data: { offerId: offer.id, txHash, quantity: qty },
      });
    },
    onSuccess: (res) => {
      toast.success(
        t("mynfts.toast_tickets_added_token", {
          n: res.ticketsAdded,
          a: res.paymentAmount,
          token: res.paymentToken,
        })
      );
      try {
        window.localStorage.removeItem("pending_ticket_purchase");
      } catch {
        /* ignore */
      }
      qc.invalidateQueries({ queryKey: ["my-tickets"] });
      qc.invalidateQueries({ queryKey: ["my-nfts"] });
    },
    onError: (e: Error) => {
      const msg = e.message;
      if (/cancel|reject|deny/i.test(msg)) {
        toast.error(t("mynfts.toast_cancelled_in_wallet"));
      } else {
        toast.error(msg);
      }
    },
  });
}
