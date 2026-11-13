// Вид награды строки промокода: кнопка с текущим видом + сетка видов под
// строкой. Тот же приём, что у призов турнира (TourPrizeKindMenu): не
// нативный <select> — Telegram-вебвью Xiaomi не коммитил выбор.
import { createContext, useContext } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { PROMO_SOFT_KINDS, promoOwnerOnly, type PromoKind } from "@/lib/promo/promoTypes";
import { PROMO_KIND_ICON } from "../promoKindIcon";

/** Не админ (право promo_soft): в сетке только энергия и лайки. */
export const PromoSoftContext = createContext(false);

/** Порядок в сетке: монеты и ресурсы, вещи, потом мера. */
const ORDER: readonly PromoKind[] = [
  "token",
  "resource",
  "custom",
  "pack",
  "art",
  "hero",
  "boss",
  "energy",
  "likes",
  "nothing",
];

/** Подписи — ключи призов турнира; у босса своя. */
const LABEL: Record<PromoKind, string> = {
  token: "tour.adm.kind.token",
  resource: "tour.adm.kind.resource",
  custom: "tour.adm.kind.custom",
  pack: "tour.adm.kind.pack",
  art: "tour.adm.kind.art",
  hero: "tour.adm.kind.hero",
  boss: "promo.adm.kind_boss",
  energy: "tour.adm.kind.energy",
  likes: "tour.adm.kind.likes",
  nothing: "promo.adm.kind_nothing",
};

export function PromoKindButton({
  value,
  open,
  onToggle,
}: {
  value: PromoKind;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const cur = PROMO_KIND_ICON[value];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-medium",
        open ? "border-gold/50" : "border-border",
      )}
    >
      <cur.Icon className={cn("h-4 w-4 shrink-0", cur.tint)} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left">{t(LABEL[value])}</span>
      <ChevronDown
        aria-hidden="true"
        className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
      />
    </button>
  );
}

export function PromoKindGrid({
  value,
  onPick,
  canToken,
}: {
  value: PromoKind;
  onPick: (k: PromoKind) => void;
  /** Токен — только владельцу (сервер отказывает остальным так же). */
  canToken: boolean;
}) {
  const t = useT();
  const soft = useContext(PromoSoftContext);
  const kinds = ORDER.filter((k) =>
    soft ? PROMO_SOFT_KINDS.includes(k) : canToken || !promoOwnerOnly(k),
  );
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-background/60 p-1">
      {kinds.map((k) => {
        const M = PROMO_KIND_ICON[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            aria-pressed={k === value}
            className={cn(
              "flex min-h-10 min-w-0 items-center gap-1.5 rounded-lg px-2 py-2 text-left text-xs",
              k === value ? "bg-gold/15 font-semibold text-gold" : "hover:bg-secondary",
            )}
          >
            <M.Icon className={cn("h-3.5 w-3.5 shrink-0", M.tint)} aria-hidden="true" />
            <span className="truncate">{t(LABEL[k])}</span>
          </button>
        );
      })}
    </div>
  );
}
