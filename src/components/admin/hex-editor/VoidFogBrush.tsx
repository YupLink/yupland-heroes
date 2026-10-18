// Кисть купола в палитре «Местность» гекс-редактора.
//
// Купол ОТНОСИТСЯ к местности, но ею не является: он не переписывает terrainId
// клетки, а ложится поверх — поэтому живёт в той же вкладке (искать его в
// отдельном разделе админ не станет), но своими двумя кнопками.
import { cn } from "@/lib/utils";
import { VOID_DOME } from "@/lib/voidDome";

/** Сентинелы кисти местности: не id типа, а команда куполу. */
export const VOID_ON = "void:on";
export const VOID_OFF = "void:off";

export function VoidFogBrush({
  value,
  onPick,
}: {
  /** Текущая кисть местности — сентинел или id обычного типа. */
  value: string;
  onPick: (id: string) => void;
}) {
  // Одна кнопка вместо парных «накрыть/снять»: клик по первой клетке мазка
  // решает направление на весь мазок — если у неё купола нет, весь мазок
  // накрываем; если есть, весь мазок снимаем. Так работает большинство
  // paint-редакторов, а место в палитре не отжирается двойным значком.
  const active = value === VOID_ON;
  return (
    <button
      onClick={() => onPick(VOID_ON)}
      className={cn(
        "flex flex-none flex-col items-center gap-0.5 rounded p-0.5 transition",
        active ? "bg-gold/10 ring-2 ring-gold" : "hover:bg-secondary/40",
      )}
      title="Купол глухого тумана. Клик по клетке накрывает или снимает — по состоянию первой клетки мазка."
    >
      <span
        className="h-9 w-9 border"
        style={{
          borderColor: VOID_DOME.edge,
          background: `repeating-linear-gradient(45deg, ${VOID_DOME.badgeBg} 0 4px, ${VOID_DOME.edge}55 4px 8px)`,
          clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)",
        }}
      />
      <span className="max-w-[52px] truncate text-[9px] text-muted-foreground">Туман</span>
    </button>
  );
}
