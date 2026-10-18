// Поле количества с −/+ — одно на окна выброса, склада и сумки зелий.
//
// Текстовое, а не type="number": на андроид-клавиатуре разделитель — запятая,
// и числовое поле отдавало «0,5» пустой строкой (см. market/NumField). Кнопки
// под палец — правило «телефон И ПК». children — хвост ряда (у зелий «Все»).
import type { ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QtyInput } from "@/hooks/useQtyInput";

export function QtyField({
  q,
  tone = "gold",
  className,
  children,
}: {
  q: QtyInput;
  /** Цвет рамки поля в фокусе: у выброса — красный, как его кнопка. */
  tone?: "danger" | "gold";
  className?: string;
  children?: ReactNode;
}) {
  const btn = "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button type="button" onClick={() => q.step(-1)} className={btn} aria-label="-1">
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="text"
        inputMode={q.integer ? "numeric" : "decimal"}
        value={q.text}
        onChange={(e) => q.type(e.target.value)}
        onBlur={q.commit}
        className={cn(
          "w-full min-w-0 rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-center text-lg font-bold outline-none",
          tone === "danger" ? "focus:border-destructive/60" : "focus:border-gold/60",
        )}
      />
      <button type="button" onClick={() => q.step(1)} className={btn} aria-label="+1">
        <Plus className="h-4 w-4" />
      </button>
      {children}
    </div>
  );
}
