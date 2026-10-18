// Вход в таверну: цена смены героя и кнопка, открывающая список героев.
// Вынесено из BuildingExtraActions.tsx без изменения поведения — тот держит
// все постройки разом и должен оставаться в лимите ≤250 строк.
import { useState } from "react";
import { Beer } from "lucide-react";
import { useT } from "@/lib/i18n";
import { TavernModal } from "./TavernModal";
import { useCastleMode } from "./castleMode";

/** Вход в таверну: цена смены героя и кнопка, открывающая список героев. */
export function TavernAction({
  q,
  r,
  priceLikes,
  swaps,
  can,
  reasonKey,
  onDone,
}: {
  q: number;
  r: number;
  priceLikes: number;
  swaps: { charges: number; left: number; nextAt: number | null } | null;
  can: boolean;
  reasonKey: string | null;
  onDone: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  // Из замка: экран таверны замка — у любой таверны мира (владелец, 07.10.2026).
  const castleMode = useCastleMode();
  return (
    <div className="space-y-1.5 rounded-2xl border border-border/60 bg-secondary/20 p-3">
      <div className="text-center text-sm">
        <b className="text-gold">
          {priceLikes > 0
            ? t("braid.tavern_swap_for", { n: priceLikes })
            : t("braid.tavern_swap_free")}
        </b>
      </div>
      {swaps && (
        <p className="text-center text-[11px] text-muted-foreground">
          {t("braid.tavern_swaps_left", { n: swaps.left, max: swaps.charges })}
        </p>
      )}
      {reasonKey && <p className="text-center text-[11px] text-destructive">{t(reasonKey)}</p>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!can}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl gradient-gold px-4 py-3 text-sm font-bold text-gold-foreground disabled:opacity-50"
      >
        <Beer className="h-4 w-4" />
        {t("braid.tavern_open")}
      </button>
      {castleMode && (
        <button
          type="button"
          onClick={castleMode.openTavern}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-gold/50 px-4 py-3 text-sm font-bold text-gold"
        >
          {t("braid.tavern_screen")}
        </button>
      )}
      {open && (
        <TavernModal
          q={q}
          r={r}
          onClose={() => {
            setOpen(false);
            onDone();
          }}
        />
      )}
    </div>
  );
}
