// Верх сетки своих товаров в пикере: чипы категорий (фильтр показа, можно
// несколько) и вход в справочник категорий. Вынесено из MarketRefPicker ради
// лимита ≤250 строк.
import { useState } from "react";
import { Tags } from "lucide-react";
import type { ItemCategory } from "@/lib/itemCategories";
import { CategoryChips } from "./CategoryChips";
import { CategoryManager } from "./CategoryManager";

export function RefPickerCustomTop({
  cats,
  counts,
  selected,
  onChange,
}: {
  cats: ItemCategory[];
  counts: Map<string, number>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [managing, setManaging] = useState(false);
  return (
    <div className="mb-2 flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <CategoryChips cats={cats} selected={selected} onChange={onChange} counts={counts} />
      </div>
      <button
        type="button"
        onClick={() => setManaging(true)}
        className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-border px-2.5 text-[11px] font-semibold text-gold"
      >
        <Tags className="h-3.5 w-3.5" /> Категории
      </button>
      {managing && <CategoryManager onClose={() => setManaging(false)} />}
    </div>
  );
}
