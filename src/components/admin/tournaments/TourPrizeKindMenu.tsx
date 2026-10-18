// Выбор вида приза: токен (DARAI первым), ресурс, свой товар, бокс, артефакт
// (конкретный или по редкости), герой, энергия, лайки, билеты. Кнопка с текущим видом + сетка видов, раскрытая ПОД строкой
// приза: не нативный <select> (Telegram-вебвью Xiaomi не коммитил выбор) и не
// всплывающий список (форма прокручивается своим телом и обрезала бы его).
import {
  ChevronDown,
  Coins,
  Gem,
  Gift,
  Heart,
  Package,
  Pickaxe,
  Shield,
  Ticket,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { PRIZE_UI_KINDS, type PrizeUiKind } from "./tourDraft";

const KIND_ICON: Record<PrizeUiKind, { Icon: LucideIcon; tint: string }> = {
  darai: { Icon: Coins, tint: "text-gold" },
  token: { Icon: Coins, tint: "text-neon" },
  resource: { Icon: Pickaxe, tint: "text-amber-300" },
  pack: { Icon: Gift, tint: "text-gold" },
  art: { Icon: Gem, tint: "text-fuchsia-300" },
  art_rarity: { Icon: Gem, tint: "text-violet-300" },
  custom: { Icon: Package, tint: "text-emerald-300" },
  hero: { Icon: Shield, tint: "text-sky-300" },
  item: { Icon: Package, tint: "text-muted-foreground" },
  energy: { Icon: Zap, tint: "text-gold" },
  likes: { Icon: Heart, tint: "text-rose-400" },
  tickets: { Icon: Ticket, tint: "text-gold" },
};

/** Кнопка с текущим видом приза; тап раскрывает сетку видов. */
export function TourPrizeKindButton({
  value,
  open,
  onToggle,
}: {
  value: PrizeUiKind;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const cur = KIND_ICON[value];
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex h-10 shrink-0 items-center gap-1.5 rounded-lg border bg-background px-2.5 text-sm font-medium",
        open ? "border-gold/50" : "border-border",
      )}
    >
      <cur.Icon className={cn("h-4 w-4", cur.tint)} />
      <span className="max-w-[86px] truncate">{t(`tour.adm.kind.${value}`)}</span>
      <ChevronDown
        className={cn("h-3.5 w-3.5 text-muted-foreground transition", open && "rotate-180")}
      />
    </button>
  );
}

/** Сетка видов приза; текущий подсвечен. */
export function TourPrizeKindGrid({
  value,
  onPick,
}: {
  value: PrizeUiKind;
  onPick: (k: PrizeUiKind) => void;
}) {
  const t = useT();
  // Текущий вид всегда в сетке: пришедший с сервера item иначе пропал бы.
  const kinds = PRIZE_UI_KINDS.includes(value) ? PRIZE_UI_KINDS : [...PRIZE_UI_KINDS, value];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-background/60 p-1">
      {kinds.map((k) => {
        const M = KIND_ICON[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onPick(k)}
            className={cn(
              "flex min-w-0 items-center gap-1.5 rounded-md px-2 py-2 text-left text-xs",
              k === value ? "bg-gold/15 font-semibold text-gold" : "hover:bg-secondary",
            )}
          >
            <M.Icon className={cn("h-3.5 w-3.5 shrink-0", M.tint)} />
            <span className="truncate">{t(`tour.adm.kind.${k}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
