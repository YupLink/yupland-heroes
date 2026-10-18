// Умное предложение энергопака: настройка всех валют в одном окне.
//
// Одна строка = один способ оплаты со своей лестницей: цена и сколько раз
// по ней можно купить за день. Кончились ступени у DARAI — предложение за
// HOPE остаётся активным (валюты считаются независимо).
//
// Пример: DARAI [1 000 000 ×2] → [5 000 000 ×2], HOPE [1000 ×1] → [2000 ×1].
import { Plus, Trash2, Coins, Ticket, Gem, DollarSign } from "lucide-react";
import { StepLadderRow } from "./StepLadderRow";
import { UsdPreview } from "./shop/UsdPriceField";
import type { OfferPricing, PayOption } from "@/lib/energySteps";
import { payName } from "@/lib/energySteps";

const ICON = { tickets: Ticket, darai: Coins, usd: DollarSign, token: Gem } as const;
const ADD_LABEL = { tickets: "билеты", darai: "DARAI", usd: "тариф в $", token: "токен" } as const;

export function EnergyLadderEditor({
  pricing,
  onChange,
  tokenSymbols,
}: {
  pricing: OfferPricing;
  onChange: (next: OfferPricing) => void;
  /** Символы токенов экосистемы для выпадашки. */
  tokenSymbols: string[];
}) {
  const setOption = (i: number, next: PayOption) =>
    onChange(pricing.map((o, k) => (k === i ? next : o)));

  const addCurrency = (kind: "tickets" | "darai" | "usd" | "token") => {
    const steps = [{ amount: kind === "usd" ? 1 : 100, times: 1 }];
    onChange([
      ...pricing,
      kind === "token" ? { kind, symbol: tokenSymbols[0] ?? "", steps } : { kind, steps },
    ]);
  };

  const used = new Set(pricing.map((o) => o.kind));

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Способы оплаты и лестница цен
      </div>

      {pricing.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Пока не задано — пак продаётся по обычным ценам выше.
        </p>
      )}

      <div className="space-y-2">
        {pricing.map((opt, i) => {
          const Icon = ICON[opt.kind];
          return (
            <div key={i} className="rounded-xl border border-border bg-secondary/20 p-2.5">
              <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0 text-gold" />
                {opt.kind === "token" ? (
                  <select
                    value={opt.symbol}
                    onChange={(e) => setOption(i, { ...opt, symbol: e.target.value })}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                  >
                    {tokenSymbols.length === 0 && <option value="">—</option>}
                    {tokenSymbols.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-bold">{payName(opt)}</span>
                )}
                <span className="text-[10px] text-muted-foreground">
                  всего {opt.steps.reduce((s, st) => s + Math.max(1, st.times), 0)} покупок/день
                </span>
                <button
                  type="button"
                  onClick={() => onChange(pricing.filter((_, k) => k !== i))}
                  className="ml-auto rounded p-1 text-rose-400 hover:text-rose-300"
                  title="Убрать валюту"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Ступени этой валюты идут вбок: цена × сколько раз. */}
              <StepLadderRow
                steps={opt.steps}
                onChange={(steps) => setOption(i, { ...opt, steps })}
              />
              {/* Тариф в $: USDT, DARAI и звёзды со счёта считаются от ступени по курсу. */}
              {opt.kind === "usd" && opt.steps[0] && (
                <UsdPreview usd={opt.steps[0].amount} className="mt-1.5" />
              )}
            </div>
          );
        })}
      </div>

      {/* Добавить ещё валюту — тот самый «+» ниже списка. */}
      <div className="flex flex-wrap gap-1.5">
        {(["tickets", "darai", "usd", "token"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => addCurrency(k)}
            disabled={k !== "token" && used.has(k)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:text-foreground disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            {ADD_LABEL[k]}
          </button>
        ))}
      </div>

      {pricing.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          Валюты считаются независимо: если за DARAI лимит выбран, покупка за другие валюты остаётся
          доступной.
        </p>
      )}
    </div>
  );
}
