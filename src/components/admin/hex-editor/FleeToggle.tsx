// Галочка «Убегает от игрока» в редакторе объекта.
//
// Отдельным файлом по той же причине, что и BossLevelField: FullObjectEditor
// и без того у лимита в 250 строк (§13 ПРАВИЛА.md).
//
// Настройка ШАБЛОНА, а не клетки: бегать умеет сам зверь, а не место, где он
// стоит. Поэтому кнопка «Сохранить для этой клетки» её не пишет — об этом и
// говорит подпись под галочкой.
import { Rabbit } from "lucide-react";
import { cn } from "@/lib/utils";

export function FleeToggle({
  value,
  onChange,
  /** У шахты убегание запрещено: к клетке привязаны владелец и добыча. */
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left text-sm font-bold transition",
          disabled
            ? "cursor-not-allowed border-border text-muted-foreground/50"
            : value
              ? "border-gold bg-gold/10 text-gold"
              : "border-border text-muted-foreground hover:border-gold/50",
        )}
      >
        <Rabbit className="h-4 w-4 shrink-0" />
        <span className="flex-1">Убегает от игрока</span>
        <span
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded border-2",
            value ? "border-gold bg-gold text-black" : "border-border",
          )}
        >
          {value ? "✓" : ""}
        </span>
      </button>
      <div className="text-[10px] leading-snug text-muted-foreground">
        {disabled
          ? "Шахта не убегает: к её клетке привязаны владелец и добыча."
          : "Игрок подошёл — объект уходит на две клетки прочь, и так каждый раз. Не идёт только в воду и сквозь преграды; на занятую клетку встаёт и прячется за тем, что на ней стоит. Настройка шаблона: действует на все его копии на карте."}
      </div>
    </div>
  );
}
