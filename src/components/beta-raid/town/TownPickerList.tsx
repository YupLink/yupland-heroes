// Список в окне выбора товаров ратуши: группы по категориям, у группы —
// «отметить всю», у товара — галка. Что уже в ратуше — отмечено и не снимается
// (убрать товар — урной в самой ратуше).
import { Check } from "lucide-react";
import { RefThumb } from "../market/RefThumb";
import type { ItemCategory } from "@/lib/itemCategories";
import type { TownRef } from "./useTownRefs";

function Box({ on, dim }: { on: boolean; dim?: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
        on ? "border-gold bg-gold text-gold-foreground" : "border-border"
      } ${dim ? "opacity-50" : ""}`}
    >
      {on && <Check className="h-3.5 w-3.5" />}
    </span>
  );
}

export function TownPickerList({
  groups,
  checked,
  taken,
  onToggle,
  onToggleGroup,
}: {
  groups: Array<{ cat: ItemCategory; items: TownRef[] }>;
  checked: Set<string>;
  /** Уже в ратуше — показываем отмеченными, но не трогаем. */
  taken: Set<string>;
  onToggle: (key: string) => void;
  onToggleGroup: (keys: string[], on: boolean) => void;
}) {
  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Ничего не нашлось</p>;
  }
  return (
    <div className="space-y-3">
      {groups.map(({ cat, items }) => {
        const free = items.filter((it) => !taken.has(it.key)).map((it) => it.key);
        const all = free.length > 0 && free.every((k) => checked.has(k));
        return (
          <section key={cat.id}>
            <button
              type="button"
              onClick={() => onToggleGroup(free, !all)}
              disabled={free.length === 0}
              className="mb-1 flex w-full items-center gap-2 py-1 text-left disabled:opacity-50"
            >
              <Box on={all || free.length === 0} dim={free.length === 0} />
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {cat.name}
              </span>
              <span className="text-[11px] text-muted-foreground">{items.length}</span>
            </button>
            <div className="space-y-1">
              {items.map((it) => {
                const isTaken = taken.has(it.key);
                const on = isTaken || checked.has(it.key);
                return (
                  <button
                    key={it.key}
                    type="button"
                    onClick={() => !isTaken && onToggle(it.key)}
                    disabled={isTaken}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left ${
                      on && !isTaken ? "border-gold/60 bg-gold/10" : "border-border"
                    }`}
                  >
                    <Box on={on} dim={isTaken} />
                    <span className="h-8 w-8 shrink-0">
                      <RefThumb image={it.image} size={64} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{it.name}</span>
                    {isTaken && (
                      <span className="shrink-0 text-[10px] text-muted-foreground">в ратуше</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
