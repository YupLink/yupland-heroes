// Выбор ТОВАРА в строке цены: тем, что продаётся в маркете, тоже платят.
//
// Список — справочник своих товаров (зелья, кирпичи, наборы трав). Ключ строки
// цены собираем как ключ стека рюкзака («custom:<id>»): именно из него товар и
// спишется, ведь после покупки он лежит у героя в рюкзаке.
//
// С МИНИАТЮРАМИ, а не голым <select>: у товаров одинаковые куски в названии
// («… зелье»), и без картинки их не различить (жалоба админа). Раскрываемся
// ИНЛАЙНОМ под кнопкой, а не оверлеем: строка цены живёт в узкой панели
// редактора со своей прокруткой, и абсолютный список она бы обрезала.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ImageOff, Loader2 } from "lucide-react";
import { thumb } from "@/lib/image";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";

function Icon({ image }: { image: string | null }) {
  if (!image)
    return (
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground">
        <ImageOff className="h-3.5 w-3.5" />
      </span>
    );
  return (
    <img
      src={thumb(image, 64)}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-7 w-7 shrink-0 rounded-md border border-border object-contain"
    />
  );
}

export function PriceItemPicker({
  itemKey,
  onPick,
}: {
  itemKey: string | null | undefined;
  onPick: (key: string | null, name: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ["market-ref", "custom"],
    queryFn: () => listCustomItems(),
    staleTime: 60_000,
  });
  const items = q.data ?? [];
  const selected = items.find((x) => `custom:${x.id}` === itemKey) ?? null;

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-xs"
      >
        <Icon image={selected?.image ?? null} />
        <span className={`flex-1 truncate text-left ${selected ? "" : "text-muted-foreground"}`}>
          {selected ? selected.name : "— выбери товар —"}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card">
          {q.isLoading ? (
            <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Загрузка…
            </div>
          ) : items.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">Нет товаров</div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onPick(null, null);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-secondary/40"
              >
                — убрать —
              </button>
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    onPick(`custom:${it.id}`, it.name);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-secondary/40 ${
                    selected?.id === it.id ? "bg-secondary/30" : ""
                  }`}
                >
                  <Icon image={it.image} />
                  <span className="flex-1 truncate">{it.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
