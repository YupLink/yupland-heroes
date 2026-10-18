// Чипы категорий (владелец, 04.10.2026): отмечаешь одну или несколько —
// список показывает только их, сгруппированными; «Все» снимает отметки.
// Несколько категорий разом ничего не ломают: это только фильтр показа.
import type { ItemCategory } from "@/lib/itemCategories";

export function CategoryChips({
  cats,
  selected,
  onChange,
  counts,
}: {
  cats: ItemCategory[];
  /** Отмеченные категории; пусто — показываются все. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Сколько товаров в категории; категории без товаров не показываются. */
  counts?: Map<string, number>;
}) {
  const shown = counts ? cats.filter((c) => (counts.get(c.id) ?? 0) > 0) : cats;
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const chip = (on: boolean) =>
    `shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
      on
        ? "border-gold bg-gold/20 text-gold"
        : "border-border bg-background/40 text-muted-foreground"
    }`;
  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" onClick={() => onChange([])} className={chip(selected.length === 0)}>
        Все
      </button>
      {shown.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => toggle(c.id)}
          className={chip(selected.includes(c.id))}
        >
          {c.name}
          {counts && <span className="ml-1 opacity-60">{counts.get(c.id) ?? 0}</span>}
        </button>
      ))}
    </div>
  );
}
