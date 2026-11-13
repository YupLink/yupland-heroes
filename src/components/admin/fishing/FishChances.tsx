// Доли видов рыбы в улове (владелец, 06.10.2026): «шанс на эту рыбу такой-то».
//
// Список короткий и живой: меняешь одному виду процент — остальные тут же
// показывают свои новые, потому что сумма всегда ровно 100 %. Пересчёт общий с
// сервером (lib/raid/fishChances), поэтому «что вижу» и «что сохранится» — одно
// и то же число. Тот же список — у находок лопатой (режим бога): там у строки
// крестик «убрать», кроме «Ничего» (fixed). И у рецепта лавки — там у строки
// ещё поле «сколько» (extra).
import type { ReactNode } from "react";
import { ImageOff, X } from "lucide-react";
import { thumb } from "@/lib/image";
import { pctText, round1, setFishPct, type FishItem } from "@/lib/raid/fishChances";

type Named = { id: string; name: string; image: string | null };

export function FishChances({
  items,
  all,
  onChange,
  /** Выделить одну рыбу (карточка товара): её строка — золотом. */
  highlight,
  onRemove,
  fixed,
  extra,
}: {
  items: readonly FishItem[];
  all: readonly Named[];
  onChange: (next: FishItem[]) => void;
  highlight?: string;
  /** Убрать строку — крестик у каждой, кроме fixed. */
  onRemove?: (id: string) => void;
  fixed?: string;
  /** Своё поле строки перед процентом (рецепт: количество). */
  extra?: (id: string) => ReactNode;
}) {
  if (items.length === 0) return null;
  const nameOf = (id: string) => all.find((x) => x.id === id) ?? { id, name: id, image: null };

  return (
    <div className="space-y-1">
      {items.map((it) => {
        const meta = nameOf(it.id);
        const mine = highlight === it.id;
        return (
          <div
            key={it.id}
            className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
              mine ? "border-gold/60 bg-gold/10" : "border-border bg-background"
            }`}
          >
            {meta.image ? (
              <img
                src={thumb(meta.image, 64)}
                alt=""
                loading="lazy"
                className="h-7 w-7 shrink-0 rounded-md border border-border object-contain"
              />
            ) : (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border">
                <ImageOff className="h-3.5 w-3.5" />
              </span>
            )}
            <span className={`flex-1 truncate text-xs ${mine ? "text-gold" : ""}`}>
              {meta.name}
            </span>
            {extra?.(it.id)}
            <input
              type="number"
              step="0.1"
              min={0}
              max={100}
              value={round1(it.pct)}
              onChange={(e) => onChange(setFishPct(items, it.id, Number(e.target.value)))}
              className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-right text-xs tabular-nums"
            />
            <span className="w-4 shrink-0 text-[11px] text-muted-foreground">%</span>
            {onRemove && (
              <button
                type="button"
                disabled={it.id === fixed}
                onClick={() => onRemove(it.id)}
                className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground disabled:invisible"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
      <p className="text-right text-[11px] text-muted-foreground">
        {pctText(items.reduce((s, it) => s + it.pct, 0))}
      </p>
    </div>
  );
}
