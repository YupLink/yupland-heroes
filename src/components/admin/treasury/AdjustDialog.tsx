// Ручная правка счёта. Последний рубеж, когда операция сорвалась на полпути.
//
// Пояснение обязательно и уезжает прямо в ключ операции: через месяц никто не
// вспомнит, откуда взялись эти токены, а в леджере останется навсегда.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { humanError } from "@/lib/humanError";
import { adminAccAdjust } from "@/server/api/currency/admin-treasury";

export function AdjustDialog({ tokens }: { tokens: string[] }) {
  const qc = useQueryClient();
  const [wallet, setWallet] = useState("");
  const [token, setToken] = useState(tokens[0] ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const delta = Number(amount.replace(",", "."));
  const valid =
    wallet.trim().length > 1 &&
    !!token &&
    Number.isFinite(delta) &&
    delta !== 0 &&
    reason.trim().length >= 4;

  const m = useMutation({
    mutationFn: () =>
      adminAccAdjust({
        data: { wallet: wallet.trim(), token, delta, reason: reason.trim() },
      }),
    onSuccess: (res) => {
      toast.success(`Готово. Стало ${res.balance} ${token}`);
      setAmount("");
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin-treasury"] });
      qc.invalidateQueries({ queryKey: ["admin-acc-ledger"] });
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center gap-2">
        <PenLine className="h-4 w-4 text-gold" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Ручная правка
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="кошелёк игрока"
          spellCheck={false}
          autoCapitalize="off"
          className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-gold/60"
        />
        <select
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-gold/60"
        >
          {tokens.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="сколько (минус — списать)"
          className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-gold/60"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="за что — попадёт в леджер"
          maxLength={120}
          className="rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-gold/60"
        />
      </div>

      <button
        type="button"
        onClick={() => m.mutate()}
        disabled={!valid || m.isPending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-background transition hover:brightness-110 disabled:opacity-50"
      >
        {m.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        Записать движение
      </button>

      <p className="text-[10px] text-muted-foreground">
        Правка не пройдёт, если уводит баланс в минус: гард живёт в самой функции счёта.
      </p>
    </div>
  );
}
