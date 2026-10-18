// Карточка «рядом корабль» — сесть на борт, не целясь в клетку.
//
// Тот же приём, что у объектов рядом: подошёл — под картой появилась строка с
// действием. На своём корабле она превращается в «сойти на берег».
import { Anchor, Hammer, LogOut } from "lucide-react";
import { useT } from "@/lib/i18n";
import { shipImageSrc, type ShipMark } from "./drawShips";
import { ShipHpBar } from "./ShipRepair";

export function ShipAdjacent({
  ship,
  aboard,
  onOpen,
}: {
  ship: ShipMark;
  /** Игрок уже на борту: корабль под ногами, а не по соседству. */
  aboard: boolean;
  onOpen: () => void;
}) {
  const t = useT();
  // Разбитый борт — не «занятый»: сесть на него нельзя, но починить можно, и
  // карточка обязана открываться. Раньше она гасла вместе с занятыми, и игрок,
  // приплывший на своём же судне, оставался с ним один на один без ремонта
  // (жалоба 08.09.2026).
  const wrecked = !aboard && ship.free <= 0 && ship.busy <= 0 && ship.broken > 0;
  // Занято — значит занято, и «своим» его не делает сестринский кошелёк того же
  // аккаунта: на судне один капитан. Раньше признак `mine` открывал кнопку
  // «Занять» на судне, где уже сидела сестра, — сервер её отбивал.
  const busy = !aboard && ship.free <= 0 && !wrecked;
  const mark = aboard ? ship : { ...ship, mine: false };
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      className="mx-2 flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-gold/40 active:scale-[0.99] disabled:opacity-50"
    >
      <img src={shipImageSrc(mark)} alt="" className="h-12 w-12 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {t("braid.ship")}
        </div>
        <div className="truncate font-display font-bold">
          {aboard
            ? t("braid.ship_yours")
            : wrecked
              ? t("braid.ship_dead_title")
              : busy
                ? t("braid.ship_busy")
                : t("braid.ship_free")}
        </div>
        {/* Запас хода прямо в карточке: до окна корабля игрок доходит не всегда,
            а число нужно ему как раз перед тем, как отчалить. */}
        {mark.hpMax > 0 && <ShipHpBar hp={mark.hp} hpMax={mark.hpMax} compact />}
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-xl gradient-gold px-3 py-2 text-sm font-bold text-gold-foreground shadow-gold">
        {aboard ? (
          <LogOut className="h-4 w-4" />
        ) : wrecked ? (
          <Hammer className="h-4 w-4" />
        ) : (
          <Anchor className="h-4 w-4" />
        )}
        {aboard ? t("braid.ship_leave") : wrecked ? t("braid.ship_repair") : t("braid.ship_take")}
      </span>
    </button>
  );
}
