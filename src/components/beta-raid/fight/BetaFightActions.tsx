// Кнопки итога боя на карте: «Атаковать снова», «i» (окно цели) и «Закрыть».
//
// Раньше было одно «ОК», и следующий удар шёл через закрытие итога и окно
// цели (владелец, 22.10.2026). Повтор бьёт ту же цель тем же отрядом, итог
// обновляется на месте. Цель добита — бить некого: только «Закрыть».
// На узком телефоне повтор — во всю ширину, «i» и «Закрыть» — строкой ниже.
import { Info, Loader2, Swords, Zap } from "lucide-react";
import { useT } from "@/lib/i18n";
import { formatEnergyCost } from "@/lib/shipRules";

export function BetaFightActions({
  killed,
  busy,
  cost,
  onAgain,
  onInfo,
  onClose,
}: {
  killed: boolean;
  /** Удар летит — повтор крутит спиннер и второй не шлёт. */
  busy: boolean;
  /** Цена удара; null — не знаем, значок не рисуем. */
  cost: number | null;
  onAgain: () => void;
  onInfo: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="mt-4 space-y-2">
      {!killed && (
        <button
          type="button"
          onClick={onAgain}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-gold px-4 font-bold text-gold-foreground transition enabled:active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
          {busy ? t("braid.fighting") : t("braid.attack_again")}
          {!busy && cost !== null && (
            <span className="inline-flex items-center gap-0.5 text-sm font-semibold opacity-80">
              <Zap className="h-3.5 w-3.5" />
              {formatEnergyCost(cost)}
            </span>
          )}
        </button>
      )}
      <div className="flex gap-2">
        {!killed && (
          <button
            type="button"
            onClick={onInfo}
            aria-label={t("braid.target_info")}
            title={t("braid.target_info")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/40 text-muted-foreground transition hover:text-foreground"
          >
            <Info className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={
            killed
              ? "h-11 w-full rounded-xl gradient-gold px-4 font-bold text-gold-foreground"
              : "h-11 min-w-0 flex-1 rounded-xl border border-border bg-secondary/40 px-4 font-semibold transition hover:bg-secondary/60"
          }
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}
