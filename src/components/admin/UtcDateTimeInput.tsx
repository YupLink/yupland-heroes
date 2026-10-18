// Поле «дата и время по UTC» админки — одно на расписание турнира и «Показывать
// до» у письма. Значение — строка поля datetime-local («2026-10-05T00:00»), её
// читают как UTC (isoOfUtcInput в admin/tournaments/tourSchedule.ts); "" — не задано.
//
// Крестик рядом с полем — очистить: у нативного datetime-local на ПК своей
// кнопки «очистить» нет, а пустое поле — осмысленное значение (старт кнопкой,
// письмо бессрочно).
import { X } from "lucide-react";

export function UtcDateTimeInput({
  id,
  value,
  onChange,
  clearLabel,
  className,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  /** Подпись крестика для читалок экрана. */
  clearLabel: string;
  /** Класс самого поля — у каждой формы свой. */
  className: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        id={id}
        type="datetime-local"
        step={60}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label={clearLabel}
          className="grid h-10 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
