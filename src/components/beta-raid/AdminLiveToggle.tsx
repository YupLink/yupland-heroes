// Тумблер «Правка карты» для админа прямо в игре.
//
// Пока выключен — обычная игра. Включён — тап по любой клетке открывает не
// «дойти и забрать», а окно правки: поставить, убрать, оживить, выдать лодку.
// Отдельный режим нужен именно затем, чтобы случайный тап не переставил босса.
import { MapPin, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminLiveToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "mx-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
        on
          ? "border-gold bg-gold/15 text-gold"
          : "border-border bg-card text-muted-foreground hover:border-gold/40",
      )}
    >
      {on ? <Wrench className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
      {on ? "Правка карты включена — тап по клетке открывает её" : "Правка карты (админ)"}
    </button>
  );
}
