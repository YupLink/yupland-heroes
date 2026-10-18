// Строка способа оплаты в карточке энергопака.
//
// Вынесена из карточки: способов стало больше (билеты, DARAI, токен переводом
// и тот же токен со счёта), и карточка перестала помещаться в свой лимит.
import { Loader2 } from "lucide-react";

export function EnergyPayRow({
  icon,
  label,
  hint,
  disabled,
  pending,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  /** Под ценой: остаток на счету, лимит по валюте и прочее мелким. */
  hint?: React.ReactNode;
  disabled: boolean;
  pending: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3.5 py-3 text-left text-sm shadow-card transition enabled:hover:border-gold/40 disabled:opacity-40"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0">{icon}</span>
        {/* Остаток стоит ПОД ценой, а не справа: на 375 px обе надписи
            не расходятся в одну строку — цена вылезала поверх плашки. */}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{label}</span>
          {hint && <span className="mt-0.5 block">{hint}</span>}
        </span>
      </span>
      <span className="shrink-0">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <span className="text-xs font-bold text-gold">Купить</span>
        )}
      </span>
    </button>
  );
}
