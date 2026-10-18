// Кисть «выделение под биом-генератор» в палитре «Местность».
//
// По образцу VoidFogBrush: одна кнопка, сентинел вместо id
// типа местности. Отличие от купола принципиальное: клетки эта кисть НЕ красит
// и в модель клетки ничего не пишет — просто помечает набор в state
// редактора, «эти клетки я хочу генерить». Реальную заливку выполнит
// биом-генератор из панели, и только по нажатию «Применить».
import { cn } from "@/lib/utils";
import { GEN_ON } from "@/components/beta-raid/brushPatch";

// Реэкспорт сентинелов через компонент — чтобы hex-editor импортировал их
// оттуда же, откуда и саму кнопку. Так работает и VoidFogBrush.
export { GEN_ON, GEN_OFF } from "@/components/beta-raid/brushPatch";

/** Жёлтая пунктирная гексограмма — характерный знак «выделение», а не заливка. */
const GEN_EDGE = "#f6c453";
const GEN_FILL = "rgba(246, 196, 83, 0.10)";

export function BiomeGenBrush({
  value,
  onPick,
}: {
  /** Текущая кисть местности — сентинел или id обычного типа. */
  value: string;
  onPick: (id: string) => void;
}) {
  // Одна кнопка вместо парных «выделить/снять»: клик по первой клетке мазка
  // решает направление на весь мазок — если она не выделена, весь мазок
  // добавляем; если выделена, весь мазок снимаем. Тот же паттерн, что у
  // «Тумана», — не сбиваем админа новыми правилами.
  const active = value === GEN_ON;
  return (
    <button
      onClick={() => onPick(GEN_ON)}
      className={cn(
        "flex flex-none flex-col items-center gap-0.5 rounded p-0.5 transition",
        active ? "bg-gold/10 ring-2 ring-gold" : "hover:bg-secondary/40",
      )}
      title="Выделение под биом-генератор. Клик по клетке добавляет или снимает — по состоянию первой клетки мазка."
    >
      {/* Пунктирная жёлтая рамка через SVG — прямоугольный dashed-border на
          гекс-clip-path CSS не ложится, а SVG повторяет силуэт точно. */}
      <span
        className="grid h-9 w-9 place-items-center"
        style={{ background: GEN_FILL, clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)" }}
      >
        <svg viewBox="0 0 100 100" width="34" height="34" aria-hidden="true">
          <polygon
            points="25,3 75,3 97,50 75,97 25,97 3,50"
            fill="none"
            stroke={GEN_EDGE}
            strokeWidth="6"
            strokeDasharray="10 6"
          />
        </svg>
      </span>
      <span className="max-w-[52px] truncate text-[9px] text-muted-foreground">Биом</span>
    </button>
  );
}
