// Кнопка «сойти на берег» с ценой и тремя состояниями ожидания.
//
// Вынесена из ShipModal ради лимита в 250 строк: сама логика та же — вслепую
// не платим, без цены кнопка не нажимается.
import { Loader2, LogOut, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatEnergyCost } from "@/lib/shipRules";

export type AshorePriceState = "ready" | "loading" | "failed" | "none";

export function ShipAshoreButton({
  cost,
  state,
  pending,
  disabled,
  onLeave,
  onRetry,
}: {
  /** Цена схода: null — сервер ещё не сказал. */
  cost: number | null;
  state: AshorePriceState;
  pending: boolean;
  disabled: boolean;
  onLeave: () => void;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <>
      <button
        type="button"
        onClick={onLeave}
        /* Вслепую не платим: без цены кнопка не нажимается. */
        disabled={disabled || cost === null}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        {t("braid.ship_go_ashore")}
        {/* Цена схода известна заранее: раньше игрок узнавал её из тоста, когда
            энергия уже списана, и она зависела от того, какую сушу выберет
            сервер. */}
        {cost !== null ? (
          <span className="inline-flex items-center gap-0.5 opacity-80">
            <Zap className="h-3.5 w-3.5" />
            {formatEnergyCost(cost)}
          </span>
        ) : state === "loading" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
        ) : null}
      </button>
      {state === "none" && (
        <p className="text-center text-[11px] text-muted-foreground">{t("braid.ship_no_shore")}</p>
      )}
      {state === "failed" && (
        <button
          type="button"
          onClick={onRetry}
          className="w-full text-center text-[11px] text-muted-foreground underline underline-offset-2"
        >
          {t("braid.ship_ashore_retry")}
        </button>
      )}
    </>
  );
}
