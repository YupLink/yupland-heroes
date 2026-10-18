import { useState } from "react";
import { Send, Plus, X, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { fmtClaim, type SisterWallet } from "./shop-shared";

export function WithdrawSplitModal({
  symbol,
  totalAmount,
  sisters,
  pending,
  onClose,
  onSubmit,
}: {
  symbol: string;
  totalAmount: number;
  sisters: SisterWallet[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (args: {
    symbol: string;
    recipient?: string;
    splits?: Array<{ recipient: string; amount: number }>;
  }) => void;
}) {
  const t = useT();
  const active = sisters.find((s) => s.isActive)?.wallet ?? sisters[0]?.wallet ?? "";
  type Row = { recipient: string; amount: number | "" };
  const [rows, setRows] = useState<Row[]>(() => [
    { recipient: active, amount: totalAmount },
  ]);

  const filledSum = rows.reduce(
    (s, r) => s + (typeof r.amount === "number" ? r.amount : 0),
    0
  );
  const remaining = Math.max(0, totalAmount - filledSum);

  const updateRow = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const removeRow = (i: number) => {
    setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));
  };
  const addRow = () => {
    if (rows.length >= sisters.length) return;
    const used = new Set(rows.map((r) => r.recipient));
    const next = sisters.find((s) => !used.has(s.wallet))?.wallet ?? active;
    setRows((rs) => [...rs, { recipient: next, amount: remaining || "" }]);
  };

  const sumValid = filledSum > 0 && filledSum <= totalAmount;
  const recipientsValid = rows.every((r) =>
    sisters.some((s) => s.wallet === r.recipient)
  );
  const anyZeroAmount = rows.some(
    (r) => !(typeof r.amount === "number" && r.amount > 0)
  );
  const canSubmit = sumValid && recipientsValid && !anyZeroAmount && !pending;

  const handleSubmit = () => {
    const splits = rows.map((r) => ({
      recipient: r.recipient,
      amount: r.amount as number,
    }));
    if (splits.length === 1 && splits[0].amount === totalAmount) {
      onSubmit({ symbol, recipient: splits[0].recipient });
    } else {
      onSubmit({ symbol, splits });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-gold" />
            <span className="font-display text-base font-bold">
              {t("mynfts.withdraw_symbol", { symbol })}
            </span>
          </div>
          <button
            onClick={onClose}
            disabled={pending}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-xs">
            {t("mynfts.available_to_withdraw")}{" "}
            <b className="text-gold">
              {fmtClaim(totalAmount)} {symbol}
            </b>
            <span className="ml-2 text-muted-foreground">
              {t("mynfts.entered_remaining", {
                entered: fmtClaim(filledSum),
                remaining: fmtClaim(remaining),
              })}
            </span>
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => {
              const sisterMaxForThis =
                remaining +
                (typeof row.amount === "number" ? row.amount : 0);
              return (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-secondary/20 p-3 space-y-2"
                >
                  {sisters.length > 1 ? (
                    <select
                      value={row.recipient}
                      onChange={(e) =>
                        updateRow(i, { recipient: e.target.value })
                      }
                      disabled={pending}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:border-gold/50"
                    >
                      {sisters.map((s) => (
                        <option key={s.wallet} value={s.wallet}>
                          {s.wallet}
                          {s.isActive ? ` · ${t("mynfts.active_wallet")}` : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono">
                      {row.recipient}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1}
                      max={sisterMaxForThis}
                      placeholder="0"
                      value={row.amount}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          updateRow(i, { amount: "" });
                        } else {
                          const n = Math.floor(Number(raw));
                          if (Number.isFinite(n) && n >= 0) {
                            updateRow(i, {
                              amount: Math.min(n, sisterMaxForThis),
                            });
                          }
                        }
                      }}
                      disabled={pending}
                      className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-right font-mono text-sm outline-none focus:border-gold/50"
                    />
                    <span className="text-xs text-muted-foreground">
                      {symbol}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateRow(i, { amount: sisterMaxForThis })
                      }
                      disabled={pending || sisterMaxForThis === 0}
                      className="rounded-lg border border-gold/30 bg-gold/5 px-2.5 py-2 text-[11px] font-medium text-gold transition hover:bg-gold/10 disabled:opacity-50"
                    >
                      MAX
                    </button>
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        disabled={pending}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-secondary/40 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {sisters.length > 1 && rows.length < sisters.length && (
            <button
              type="button"
              onClick={addRow}
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-secondary/20 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-gold/40 hover:text-foreground disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("mynfts.add_recipient")}
            </button>
          )}

          {filledSum > totalAmount && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
              {t("mynfts.sum_exceeds", { sum: filledSum, max: totalAmount })}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary disabled:opacity-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl gradient-gold px-4 py-2.5 text-sm font-bold text-gold-foreground shadow-gold transition hover:scale-[1.01] disabled:opacity-60"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("mynfts.withdraw_amount", { amount: filledSum, symbol })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
