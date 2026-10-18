import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, X, Plus, Coins } from "lucide-react";
import { toast } from "sonner";
import { getSignerWallet } from "@/lib/near-connector";
import { useT } from "@/lib/i18n";
import { getDaraiDepositInfo, verifyDaraiDeposit } from "@/server/api/chips-craft";
import { extractTxHash } from "./nft-input-shared";
import { DepositHistory } from "./DepositHistory";
import { humanError } from "@/lib/humanError";

export function DaraiDepositModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [amount, setAmount] = useState<string>("1000000");
  const [manualHash, setManualHash] = useState("");
  const info = useQuery({
    queryKey: ["darai-deposit-info"],
    queryFn: () => getDaraiDepositInfo(),
    staleTime: 5 * 60_000,
  });

  const minHuman = info.data?.minHuman ?? 1_000_000;
  const amountNum = Number(amount.replace(/\s/g, ""));
  const amountValid =
    Number.isFinite(amountNum) && Number.isInteger(amountNum) && amountNum >= minHuman;
  const manualHashValid = /^[A-HJ-NP-Za-km-z1-9]{30,64}$/.test(manualHash.trim());

  const send = useMutation({
    mutationFn: async () => {
      if (!info.data) throw new Error("Загружаем конфиг…");
      if (!amountValid) throw new Error(`Минимум ${minHuman.toLocaleString("ru-RU")} DARAI`);

      const w = await getSignerWallet();
      const rawAmount = (BigInt(amountNum) * 10n ** BigInt(info.data.decimals)).toString();

      const outcome = await w.signAndSendTransactions({
        transactions: [
          {
            receiverId: info.data.ftContract,
            actions: [
              {
                type: "FunctionCall",
                params: {
                  methodName: "storage_deposit",
                  args: {
                    account_id: info.data.receiverId,
                    registration_only: true,
                  },
                  gas: "10000000000000",
                  deposit: "1250000000000000000000",
                },
              },
              {
                type: "FunctionCall",
                params: {
                  methodName: "ft_transfer",
                  args: {
                    receiver_id: info.data.receiverId,
                    amount: rawAmount,
                    memo: "yuplink darai top-up",
                  },
                  gas: "30000000000000",
                  deposit: "1",
                },
              },
            ],
          },
        ],
      });

      console.log("[darai-deposit] outcome:", outcome);

      const txHash = extractTxHash(outcome);
      if (!txHash) {
        throw new Error(
          "Кошелёк не вернул txHash. Открой историю кошелька, скопируй hash транзакции к darai.tkn.near и вставь его ниже в поле «Уже отправил?».",
        );
      }

      return verifyDaraiDeposit({ data: { txHash } });
    },
    onSuccess: (res) => {
      toast.success(t("chips.topped_up", { amount: res.amount.toLocaleString("ru-RU") }));
      qc.invalidateQueries({ queryKey: ["my-darai-balance"] });
      qc.invalidateQueries({ queryKey: ["my-darai-deposits"] });
      onClose();
    },
    onError: (e: Error) => {
      const msg = e.message;
      if (/cancel|reject|deny/i.test(msg)) toast.error(t("chips.cancelled_in_wallet"));
      else toast.error(msg);
    },
  });

  const verifyManual = useMutation({
    mutationFn: async () => {
      if (!manualHashValid) throw new Error("Невалидный txHash");
      return verifyDaraiDeposit({ data: { txHash: manualHash.trim() } });
    },
    onSuccess: (res) => {
      toast.success(t("chips.credited", { amount: res.amount.toLocaleString("ru-RU") }));
      qc.invalidateQueries({ queryKey: ["my-darai-balance"] });
      qc.invalidateQueries({ queryKey: ["my-darai-deposits"] });
      onClose();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-3xl border border-neon/30 bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-neon" />
            <span className="font-display text-base font-bold">{t("chips.top_up_darai")}</span>
          </div>
          <button
            onClick={onClose}
            disabled={send.isPending}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="space-y-1">
            <label className="block text-[11px] font-medium text-muted-foreground">
              {t("chips.how_much_darai", {
                min: minHuman.toLocaleString("ru-RU"),
              })}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
              disabled={send.isPending}
              placeholder={String(minHuman)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-base outline-none focus:border-neon/60"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={send.isPending || verifyManual.isPending}
              className="flex-1 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={() => send.mutate()}
              disabled={!amountValid || send.isPending || info.isLoading}
              className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl bg-neon px-4 py-2.5 text-sm font-bold text-background shadow-card transition hover:scale-[1.01] disabled:opacity-60 disabled:hover:scale-100"
            >
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {send.isPending
                ? t("chips.signing")
                : `${t("chips.top_up")} ${amountValid ? `· ${amountNum.toLocaleString("ru-RU")}` : ""}`}
            </button>
          </div>

          <div className="rounded-lg border border-dashed border-border/60 bg-secondary/10 p-3 space-y-2">
            <div className="text-[11px] font-medium text-muted-foreground">
              {t("chips.already_sent_hint")}
            </div>
            <input
              type="text"
              value={manualHash}
              onChange={(e) => setManualHash(e.target.value)}
              placeholder={t("chips.tx_hash_example")}
              spellCheck={false}
              autoCapitalize="off"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-[11px] outline-none focus:border-neon/60"
            />
            <button
              type="button"
              onClick={() => verifyManual.mutate()}
              disabled={!manualHashValid || verifyManual.isPending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-neon/40 bg-neon/5 px-3 py-2 text-[12px] font-medium text-neon transition hover:bg-neon/10 disabled:opacity-50"
            >
              {verifyManual.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("chips.credit_by_txhash")}
            </button>
          </div>

          <DepositHistory />
        </div>
      </div>
    </div>,
    document.body,
  );
}
