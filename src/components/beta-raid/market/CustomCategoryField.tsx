// Поле «Категория» в форме своего товара (владелец, 04.10.2026). Кнопками, а не
// <select>: в телеграм-вебвью на Xiaomi родной select выбор не фиксирует.
// Вынесено из MarketCustomCreate ради лимита ≤250 строк.
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { NO_CATEGORY } from "@/lib/itemCategories";
import { listItemCategories } from "@/server/api/beta-raid/item-categories";

export function CustomCategoryField({
  value,
  onChange,
}: {
  /** id категории; null — «без категории». */
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const q = useQuery({
    queryKey: ["item-categories"],
    queryFn: () => listItemCategories(),
    staleTime: 60_000,
  });
  const cats = q.data;
  // Категорию удалили, а форма открыта со старым id (или товар из старого
  // кэша): сохранение упало бы на внешнем ключе — честно сбрасываем.
  useEffect(() => {
    if (cats && value && !cats.some((c) => c.id === value)) onChange(null);
  }, [cats, value, onChange]);

  const opts: Array<{ id: string | null; name: string }> = [
    ...(cats ?? []).map((c) => ({ id: c.id, name: c.name })),
    { id: null, name: NO_CATEGORY.name },
  ];
  return (
    <div>
      <span className="mb-1 flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
        Категория
        {q.isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => (
          <button
            key={o.id ?? NO_CATEGORY.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              o.id === value
                ? "border-gold bg-gold/20 text-gold"
                : "border-border bg-background/40 text-muted-foreground"
            }`}
          >
            {o.name}
          </button>
        ))}
      </div>
    </div>
  );
}
