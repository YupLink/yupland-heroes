// Выбор борта, когда на клетке их несколько.
//
// Игроки жаловались: три корабля у причала, а действия адресовались клеткой —
// садишься и чинишь «какой-то». Список показываем только когда выбирать
// действительно есть из чего: один борт на клетке — прежнее окно без лишнего.
import { Anchor, Bomb, Ship, Wrench } from "lucide-react";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { ShipAtCell } from "@/server/api/beta-raid/ship-list";

export function ShipPicker({
  ships,
  selected,
  onSelect,
}: {
  ships: ShipAtCell[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  if (ships.length < 2) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t("braid.ship_pick")}
      </div>
      <div className="space-y-1">
        {ships.map((s) => {
          // Подбитый (dynamite-08) — своим словом: он разбит, но не чинится.
          const state = s.blasted
            ? t("braid.ship_blasted_title")
            : s.broken
              ? t("braid.ship_dead_title")
              : s.mine
                ? t("braid.ship_mine_title")
                : s.busy
                  ? t("braid.ship_other_title")
                  : t("braid.ship_free");
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs",
                selected === s.id ? "border-gold bg-gold/10" : "border-border",
              )}
            >
              {s.blasted ? (
                <Bomb className="h-4 w-4 shrink-0 text-destructive" />
              ) : s.broken ? (
                <Wrench className="h-4 w-4 shrink-0 text-destructive" />
              ) : s.busy ? (
                <Anchor className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Ship className="h-4 w-4 shrink-0 text-success" />
              )}
              <span className="min-w-0 flex-1 truncate font-semibold">
                {t(s.kind === "big" ? "braid.ship_big" : "braid.ship_small")} · {state}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {Math.max(0, Math.round(s.hp))}/{s.hpMax}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
