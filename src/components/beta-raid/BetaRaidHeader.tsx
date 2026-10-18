import { RaidCastleButton } from "./RaidCastleButton";
import { ChevronLeft } from "lucide-react";
import { useT } from "@/lib/i18n";

/** Шапка экрана: «Назад» слева, название карты. Энергию тут НЕ показываем —
 *  она уже есть в шапке приложения (не дублируем то, что на экране). */
export function BetaRaidHeader({
  mapName,
  onClose,
  hexMain,
  castleAccess,
}: {
  mapName: string;
  onClose: () => void;
  /** Гекс-карта стала основным рейдом — приставка «бета» больше не нужна. */
  hexMain?: boolean;
  castleAccess?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 px-1">
      <button
        onClick={onClose}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-secondary/40 text-muted-foreground transition hover:text-foreground"
        aria-label={t("common.back")}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("raid.title")}
        </div>
        <h2 className="truncate font-display text-lg font-bold text-gold">{mapName}</h2>
      </div>
      {castleAccess && <RaidCastleButton />}
    </div>
  );
}
