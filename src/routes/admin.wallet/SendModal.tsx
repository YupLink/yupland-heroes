import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Loader2 } from "lucide-react";
import { myWalletBalances } from "@/server/api/embedded";
import { sendNear, sendFt, sendNft, hasPin } from "@/lib/embeddedWallet";
import { humanizeError, formatYoctoStr } from "./helpers";
import { NEAR_GAS_RESERVE_YOCTO } from "./types";
import { PinInput } from "./inputs";
import type { SendTarget } from "./types";

export function SendModal({
  accountId,
  target,
  onClose,
  onSuccess,
}: {
  accountId: string;
  target: SendTarget;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<"form" | "preview" | "sending">("form");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [pin, setPin] = useState("");
  const [pinNeeded, setPinNeeded] = useState(false);

  const lazyBal = useQuery({
    queryKey: ["my", "wallet", accountId, "balances"],
    queryFn: () => myWalletBalances({ data: { accountId } }),
    enabled: target.kind === "near" && !!target.lazy,
    staleTime: 30_000,
  });

  useEffect(() => {
    hasPin(accountId).then(setPinNeeded).catch(() => setPinNeeded(false));
  }, [accountId]);

  const symbol = target.kind === "near" ? "NEAR" : target.kind === "ft" ? target.symbol : "";
  const nearYoctoForMax = target.kind === "near"
    ? target.lazy ? lazyBal.data?.nearYocto ?? "0" : target.nearYocto
    : "0";

  const maxAvailable = (() => {
    if (target.kind === "near") {
      const total = BigInt(nearYoctoForMax);
      const free = total > NEAR_GAS_RESERVE_YOCTO ? total - NEAR_GAS_RESERVE_YOCTO : 0n;
      return formatYoctoStr(free.toString(), 24);
    }
    if (target.kind === "ft") return formatYoctoStr(target.balance, target.decimals);
    return "";
  })();

  const mut = useMutation({
    mutationFn: async () => {
      if (!recipient.trim()) throw new Error("Введи адрес получателя");
      if (pinNeeded && !pin) throw new Error("Введи PIN");
      if (target.kind === "near") {
        if (!amount) throw new Error("Введи сумму");
        return sendNear({ accountId, pin: pin || undefined, recipient: recipient.trim(), amountNear: amount });
      }
      if (target.kind === "ft") {
        if (!amount) throw new Error("Введи сумму");
        return sendFt({ accountId, pin: pin || undefined, ftContract: target.ftContract, decimals: target.decimals, recipient: recipient.trim(), amount });
      }
      return sendNft({ accountId, pin: pin || undefined, nftContract: target.nftContract, tokenId: target.tokenId, recipient: recipient.trim() });
    },
    onSuccess: (res) => { toast.success(`Отправлено! tx: ${res.txHash.slice(0, 12)}…`); onSuccess(); },
    onError: (e: Error) => { setStep("form"); toast.error(humanizeError(e.message)); },
  });

  const what = target.kind === "near" ? "NEAR" : target.kind === "ft" ? target.symbol : `NFT «${target.title}»`;

  function goToPreview() {
    if (!recipient.trim()) { toast.error("Введи адрес получателя"); return; }
    if (target.kind !== "nft" && !amount.trim()) { toast.error("Введи сумму"); return; }
    if (pinNeeded && !pin) { toast.error("Введи PIN"); return; }
    setStep("preview");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold">
            {step === "preview" ? "Подтверди отправку" : `Отправить ${what}`}
          </h3>
          <button onClick={onClose} className="rounded-full border border-border bg-secondary p-1">
            <X className="h-3 w-3" />
          </button>
        </div>
        {step === "form" && (
          <>
            <label className="block">
              <div className="mb-1 text-xs text-muted-foreground">Получатель</div>
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="example.near" className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs" autoFocus />
            </label>
            {target.kind !== "nft" && (
              <label className="block">
                <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Сумма ({symbol})</span>
                  <button type="button" onClick={() => setAmount(maxAvailable)} className="rounded border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] text-gold">
                    MAX: {maxAvailable}
                  </button>
                </div>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.5" inputMode="decimal" className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs" />
                {target.kind === "near" && (
                  <div className="mt-1 text-[10px] text-muted-foreground">MAX = весь баланс минус ~0.05 NEAR резерв на газ/storage</div>
                )}
              </label>
            )}
            {pinNeeded && <PinInput value={pin} onChange={setPin} label="PIN" />}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={onClose} className="rounded-full border border-border bg-card px-3 py-2 text-xs">Отмена</button>
              <button onClick={goToPreview} className="flex items-center justify-center gap-1 rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground">Далее →</button>
            </div>
          </>
        )}
        {step === "preview" && (
          <>
            <div className="space-y-2 rounded-xl border border-gold/30 bg-gold/5 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Что:</span>
                <span className="font-bold">{what}</span>
              </div>
              {target.kind !== "nft" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Сумма:</span>
                  <span className="font-mono text-gradient-gold text-sm font-bold">{amount} {symbol}</span>
                </div>
              )}
              {target.kind === "nft" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Token ID:</span>
                  <span className="font-mono text-[10px]">{target.tokenId}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Откуда:</span>
                <span className="truncate font-mono text-[10px]">{accountId}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Кому:</span>
                <span className="truncate font-mono text-[10px]">{recipient.trim()}</span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-gold/20 pt-2">
                <span className="text-muted-foreground">Газ (комиссия):</span>
                <span className="font-mono">~0.001 NEAR (твоя)</span>
              </div>
              {target.kind === "ft" && (
                <div className="text-[10px] text-muted-foreground">
                  Если получатель ещё не зарегистрирован на контракте токена — добавится storage_deposit ~0.00125 NEAR (одноразово, твой)
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setStep("form")} className="rounded-full border border-border bg-card px-3 py-2 text-xs">← Изменить</button>
              <button disabled={mut.isPending} onClick={() => mut.mutate()} className="flex items-center justify-center gap-1 rounded-full gradient-gold px-3 py-2 text-xs font-bold text-gold-foreground disabled:opacity-50">
                {mut.isPending ? <><Loader2 className="h-3 w-3 animate-spin" /> Отправляю…</> : "Подтвердить"}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">Подпись делается у тебя в браузере, ключ не уходит на сервер.</p>
          </>
        )}
      </div>
    </div>
  );
}
