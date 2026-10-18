// Степпер количества −/N/+ для сделки на N единиц. Кнопки под палец: правило
// «телефон И ПК». compact — мельче (h-7) для тесной плитки грида 3-в-ряд.
// Кэп сверху задаёт остаток товара (max), снизу — min (0 для корзины).
// Шаг всегда 1: товар кладут в корзину штуками, дробится только цена.
import { Minus, Plus } from "lucide-react";
import { numText } from "./num";

export function QtyStepper({
  value,
  max,
  min = 1,
  disabled,
  compact,
  onChange,
}: {
  value: number;
  /** Верхний предел (остаток). null/undefined — без лимита. */
  max?: number | null;
  min?: number;
  disabled?: boolean;
  /** Компактный размер для плитки грида. */
  compact?: boolean;
  onChange: (v: number) => void;
}) {
  const canDec = !disabled && value > min;
  const canInc = !disabled && (max == null || value < max);
  const btn = `grid ${
    compact ? "h-7 w-7" : "h-8 w-8"
  } shrink-0 place-items-center rounded-lg border border-border bg-background/60 text-foreground disabled:opacity-40`;
  const num = `${compact ? "w-8 text-xs" : "w-10 text-sm"} text-center font-semibold tabular-nums`;
  // Число пишем языком игрока: у остатка бывает дробный хвост со старых сделок.
  const shown = numText(value);
  return (
    <div className={`flex items-center ${compact ? "justify-between" : "gap-1"}`}>
      <button
        type="button"
        aria-label="−"
        disabled={!canDec}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={btn}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className={num}>{shown}</span>
      <button
        type="button"
        aria-label="+"
        disabled={!canInc}
        onClick={() => onChange(max == null ? value + 1 : Math.min(max, value + 1))}
        className={btn}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
