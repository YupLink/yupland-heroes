// Улов рыбалки в админке (ПРАВИЛА §8.35): выбор своих товаров списком — id руками
// не вводят. Выбранные — золотыми плашками сверху (тап — убрать), ниже весь
// справочник с поиском (тап — добавить). Картинка рядом с именем: у своих
// товаров имена похожи, по одному тексту легко ошибиться (как в наградах).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageOff, X } from "lucide-react";
import { thumb } from "@/lib/image";
import { FISH_ITEMS_MAX } from "@/lib/raid/fishing";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";

type Item = { id: string; name: string; image: string | null };

function Pic({ image }: { image: string | null }) {
  return image ? (
    <img
      src={thumb(image, 64)}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-7 w-7 shrink-0 rounded-md border border-border object-contain"
    />
  ) : (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border">
      <ImageOff className="h-3.5 w-3.5" />
    </span>
  );
}

export function FishingCatchGrid({
  picked,
  onToggle,
}: {
  picked: readonly string[];
  onToggle: (id: string) => void;
}) {
  // Ключ кэша общий со справочником своих товаров (грядка, награды, маркет).
  const q = useQuery({
    queryKey: ["custom-items"],
    queryFn: () => listCustomItems(),
    staleTime: 60_000,
  });
  const [find, setFind] = useState("");
  const all: Item[] = q.data ?? [];
  const chosen = picked.map(
    (id) => all.find((it) => it.id === id) ?? { id, name: id, image: null },
  );
  const needle = find.trim().toLowerCase();
  const rest = all.filter(
    (it) => !picked.includes(it.id) && (!needle || it.name.toLowerCase().includes(needle)),
  );
  const full = picked.length >= FISH_ITEMS_MAX;
  return (
    <div className="space-y-2">
      {chosen.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chosen.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className="flex max-w-full items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-2 py-1 text-xs text-gold"
            >
              <Pic image={it.image} />
              <span className="truncate">{it.name}</span>
              <X className="h-3.5 w-3.5 shrink-0" />
            </button>
          ))}
        </div>
      )}
      <input
        value={find}
        onChange={(e) => setFind(e.target.value)}
        placeholder="Найти товар"
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base"
      />
      <div className="grid max-h-44 w-full grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain">
        {q.isLoading && <p className="col-span-2 text-[11px] text-muted-foreground">Загрузка…</p>}
        {rest.map((it) => (
          <button
            key={it.id}
            type="button"
            disabled={full}
            onClick={() => onToggle(it.id)}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-left text-xs text-muted-foreground transition disabled:opacity-50"
          >
            <Pic image={it.image} />
            <span className="truncate">{it.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
