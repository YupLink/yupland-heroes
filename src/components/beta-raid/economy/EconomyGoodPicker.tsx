// Свой выпадающий список товаров: с иконками, редкостью и поиском.
// Нативный <select> не умеет показывать <img> — а на слайде без иконок
// «Bee Book» неотличим от «Bee book», админ вынужден их пробовать глазами.
//
// Открывающийся оверлей — тот же приём, что у пикеров призов: закрытие по
// клику мимо и по Esc. Sticky-сёрч сверху, список — виртуально не нужен,
// шаблонов маркета редко больше пары сотен.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PriceGood } from "@/server/api/beta-raid/admin-economy-types";
import { RarityBadge } from "./EconomyRarity";

export function EconomyGoodPicker({
  goods,
  value,
  onChange,
}: {
  goods: PriceGood[];
  value: string;
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);

  const current = goods.find((g) => g.key === value) ?? null;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return goods;
    return goods.filter(
      (g) =>
        g.name.toLowerCase().includes(s) ||
        (g.rarity ?? "").toLowerCase().includes(s) ||
        g.kind.toLowerCase().includes(s),
    );
  }, [goods, q]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrap.current) return;
      if (!wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2 py-2 text-left text-[12px] transition hover:border-gold/60"
      >
        {current?.image ? (
          <img src={current.image} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
        ) : (
          <div className="h-6 w-6 shrink-0 rounded bg-secondary" />
        )}
        <span className="min-w-0 flex-1 truncate font-semibold">
          {current?.name ?? "Выбрать товар"}
        </span>
        {current?.rarity && <RarityBadge rarity={current.rarity} />}
        <span className="shrink-0 text-[10px] text-muted-foreground">{current?.kind}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-40 max-h-72 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="sticky top-0 flex items-center gap-2 border-b border-border bg-card px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Найти товар…"
              className="min-w-0 flex-1 rounded bg-background px-2 py-1 text-[12px] outline-none"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-6 w-6 place-items-center rounded-full border border-border text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="p-3 text-[11px] text-muted-foreground">Ничего не нашлось.</li>
            ) : (
              filtered.map((g) => (
                <li key={g.key}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(g.key);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] transition hover:bg-secondary/40",
                      value === g.key && "bg-secondary/60",
                    )}
                  >
                    {g.image ? (
                      <img src={g.image} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="h-5 w-5 shrink-0 rounded bg-secondary" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                    {g.rarity && <RarityBadge rarity={g.rarity} />}
                    <span className="shrink-0 text-[10px] text-muted-foreground">{g.kind}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
