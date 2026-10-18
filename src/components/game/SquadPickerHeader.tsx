// Шапка отряд-пикера: счётчик слотов и кнопки «Авто», «Заменить выбывших»,
// «Очистить», «Показать фишки». Разметка перенесена из ChipSquadPicker без
// изменений — тот держится в пределах 250 строк.
import { Shield, Wand2, ChevronDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

const BUSY_BTN =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive transition hover:bg-destructive/20";

export function SquadPickerHeader({
  count,
  max,
  fieldSlots,
  canAuto,
  busyInLineup,
  invOpen,
  onAuto,
  onReplaceBusy,
  onClear,
  onToggleInv,
}: {
  count: number;
  max: number;
  fieldSlots: number;
  canAuto: boolean;
  busyInLineup: number;
  invOpen: boolean;
  onAuto: () => void;
  onReplaceBusy: () => void;
  onClear: () => void;
  onToggleInv: () => void;
}) {
  const t = useT();
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold">
        <Shield className="h-4 w-4 shrink-0 text-gold" /> {t("boss.squad")}
        <span className="text-muted-foreground">
          {t("squad.count_field", { n: count, max, f: fieldSlots })}
        </span>
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={onAuto}
          disabled={!canAuto}
          title={t("boss.pick_strongest")}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-gold/40 bg-gold/5 px-2 py-0.5 text-[11px] font-medium text-gold transition enabled:hover:bg-gold/15 disabled:opacity-40"
        >
          <Wand2 className="h-3 w-3" /> {t("squad.auto")}
        </button>
        {busyInLineup > 0 && (
          <button onClick={onReplaceBusy} className={BUSY_BTN}>
            <RefreshCw className="h-3 w-3" /> {t("squad.replace_busy", { n: busyInLineup })}
          </button>
        )}
        {count > 0 && (
          <button
            onClick={onClear}
            className="whitespace-nowrap text-xs text-muted-foreground transition hover:text-destructive"
          >
            {t("squad.clear")}
          </button>
        )}
        <button
          onClick={onToggleInv}
          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-gold"
        >
          {invOpen ? t("squad.hide_chips") : t("squad.pick_chips")}
          <ChevronDown className={cn("h-3.5 w-3.5 transition", invOpen && "rotate-180")} />
        </button>
      </div>
    </div>
  );
}
