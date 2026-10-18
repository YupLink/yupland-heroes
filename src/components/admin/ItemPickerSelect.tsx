// Выпадающий выбор артефакта/героя с картинкой и бейджем редкости.
// Обычный <select> тут не годится: предметов много и они различаются
// в первую очередь артом, а не названием.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";
import { metaLabel, stripStatSuffix } from "@/components/heroMeta";
import { itemBadge, itemGlyph, itemRing, type ItemRow } from "./itemsAdminShared";

export function ItemPickerSelect({
  items,
  value,
  onChange,
  placeholder,
}: {
  items: ItemRow[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const selected = items.find((it) => it.id === value) ?? null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm transition hover:border-gold/40"
      >
        {selected ? (
          <>
            <ItemThumb it={selected} size={6} />
            <span className="min-w-0 flex-1 truncate">{stripStatSuffix(selected.name)}</span>
            {itemBadge(selected, lang) && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: itemRing(selected) + "22", color: itemRing(selected) }}
              >
                {itemBadge(selected, lang)}
              </span>
            )}
          </>
        ) : (
          <span className="flex-1 truncate text-muted-foreground">{placeholder}</span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 flex-none text-muted-foreground transition", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-background/60 p-1">
          {items.length === 0 ? (
            <div className="p-3 text-center text-xs text-muted-foreground">Нет активных</div>
          ) : (
            items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => {
                  onChange(it.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition",
                  it.id === value ? "bg-gold/15" : "hover:bg-secondary/60",
                )}
              >
                <ItemThumb it={it} size={7} />
                <span className="min-w-0 flex-1 truncate">{stripStatSuffix(it.name)}</span>
                {it.kind === "hero" && it.specialization && (
                  <span className="hidden shrink-0 truncate text-[10px] text-muted-foreground sm:inline">
                    {metaLabel(it.specialization, lang)}
                  </span>
                )}
                {itemBadge(it, lang) && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{ background: itemRing(it) + "22", color: itemRing(it) }}
                  >
                    {itemBadge(it, lang)}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ItemThumb({ it, size }: { it: ItemRow; size: 6 | 7 }) {
  const box = size === 6 ? "h-6 w-6" : "h-7 w-7";
  const ring = itemRing(it);
  if (it.imageUrl) {
    return (
      <img
        src={thumb(it.imageUrl, 40)}
        alt=""
        className={cn(box, "flex-none rounded object-cover")}
        style={{ boxShadow: `0 0 0 1.5px ${ring}88` }}
      />
    );
  }
  return (
    <span
      className={cn(box, "grid flex-none place-items-center rounded text-[13px]")}
      style={{ background: ring + "22", color: ring }}
    >
      {itemGlyph(it)}
    </span>
  );
}
