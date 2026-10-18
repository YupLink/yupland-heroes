// Мелочь, из которой собрана панель автораздачи: поле числа, чип-переключатель
// и строка с галочкой. Вынесено отдельно, чтобы четыре раздела не переписывали
// одни и те же классы по-своему.
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Поле числа.
 *
 * Тип text, а не number: на андроид-клавиатуре десятичный разделитель —
 * запятая, а браузер отдаёт «0,5» из числового поля ПУСТОЙ строкой (см.
 * market/NumField). Разбор наш, в scatterDraft, и он понимает обе запятые.
 */
export function NumBox({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "w-16 rounded-lg border border-border bg-background px-2 py-1.5 text-center text-[13px] tabular-nums outline-none focus:border-gold/50 disabled:opacity-40",
        className,
      )}
    />
  );
}

/** Чип-переключатель: вид фонда, редкость, шаблон. */
export function Chip({
  on,
  onClick,
  children,
  color,
  className,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Свой цвет рамки — им красится редкость. */
  color?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={on && color ? { borderColor: color, color } : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition",
        on ? "border-gold/50 bg-gold/10 text-gold" : "border-border text-muted-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Строка с галочкой: «снять убитых» и прочие тумблеры внутри раздела. */
export function CheckRow({
  on,
  onToggle,
  label,
  hint,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-lg px-0.5 py-1 text-left"
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
          on ? "border-gold bg-gold/15 text-gold" : "border-border text-transparent",
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-semibold">{label}</span>
        {hint && (
          <span className="block text-[10px] leading-tight text-muted-foreground">{hint}</span>
        )}
      </span>
    </button>
  );
}

/** Подпись поля — одинаковая мелкая шапка над контролом. */
export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}
