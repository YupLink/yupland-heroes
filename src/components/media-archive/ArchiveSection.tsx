// Раздел архива: заголовок с галкой «всю категорию», подгруппы (категория
// товара, группа облика) — своими заголовками с галкой, и сетка картинок.
import { memo } from "react";
import { Check, Download } from "lucide-react";
import { thumb } from "@/lib/image";
import { extOf, safeFileName, type ArchiveItem } from "@/lib/mediaArchive";

export function Box({ on }: { on: boolean }) {
  return (
    <span
      className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${
        on ? "border-gold bg-gold text-gold-foreground" : "border-border bg-background/80"
      }`}
    >
      {on && <Check className="h-3.5 w-3.5" />}
    </span>
  );
}

const Card = memo(function Card({
  item,
  on,
  onToggle,
  downloadLabel,
}: {
  item: ArchiveItem;
  on: boolean;
  onToggle: (key: string) => void;
  downloadLabel: string;
}) {
  return (
    <div
      onClick={() => onToggle(item.key)}
      className={`relative cursor-pointer rounded-xl border p-1.5 ${
        on ? "border-gold bg-gold/10" : "border-border"
      }`}
    >
      <span className="absolute left-2.5 top-2.5 z-10">
        <Box on={on} />
      </span>
      <a
        href={item.url}
        download={`${safeFileName(item.name)}.${extOf(item.url)}`}
        onClick={(e) => e.stopPropagation()}
        aria-label={downloadLabel}
        title={downloadLabel}
        className="absolute right-2.5 top-2.5 z-10 grid h-7 w-7 place-items-center rounded-full bg-black/70 text-gold"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
      <div className="aspect-square overflow-hidden rounded-lg bg-secondary/40">
        <img
          src={thumb(item.url, 256)}
          alt={item.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
        />
      </div>
      <div className="mt-1 truncate px-0.5 text-xs" title={item.name}>
        {item.name}
      </div>
    </div>
  );
});

function Grid(props: {
  items: ArchiveItem[];
  checked: Set<string>;
  onToggle: (key: string) => void;
  downloadLabel: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
      {props.items.map((it) => (
        <Card
          key={it.key}
          item={it}
          on={props.checked.has(it.key)}
          onToggle={props.onToggle}
          downloadLabel={props.downloadLabel}
        />
      ))}
    </div>
  );
}

/** Заголовок с галкой: отмечены все — снять, иначе отметить все. */
function Head({
  title,
  items,
  checked,
  onToggleMany,
  big,
}: {
  title: string;
  items: ArchiveItem[];
  checked: Set<string>;
  onToggleMany: (keys: string[], on: boolean) => void;
  big?: boolean;
}) {
  const all = items.every((it) => checked.has(it.key));
  return (
    <button
      type="button"
      onClick={() =>
        onToggleMany(
          items.map((it) => it.key),
          !all,
        )
      }
      className="mb-2 flex items-center gap-2 text-left"
    >
      <Box on={all} />
      <span className={big ? "font-display text-lg font-bold" : "text-sm font-semibold"}>
        {title}
      </span>
      <span className="text-xs text-muted-foreground">{items.length}</span>
    </button>
  );
}

export function ArchiveSection({
  title,
  items,
  checked,
  onToggle,
  onToggleMany,
  downloadLabel,
  noSubLabel,
}: {
  title: string;
  items: ArchiveItem[];
  checked: Set<string>;
  onToggle: (key: string) => void;
  onToggleMany: (keys: string[], on: boolean) => void;
  downloadLabel: string;
  /** Подпись подгруппы для картинок без неё (товар без категории). */
  noSubLabel: string;
}) {
  // Подгруппы в порядке, как пришли с сервера (он сортирует по имени).
  const subs = new Map<string, ArchiveItem[]>();
  for (const it of items) {
    const k = it.sub ?? "";
    const list = subs.get(k);
    if (list) list.push(it);
    else subs.set(k, [it]);
  }
  const grouped = subs.size > 1 || !subs.has("");
  const grid = { checked, onToggle, downloadLabel };
  return (
    <section>
      <Head title={title} items={items} checked={checked} onToggleMany={onToggleMany} big />
      {grouped ? (
        <div className="space-y-4">
          {[...subs].map(([sub, list]) => (
            <div key={sub}>
              <Head title={sub || noSubLabel} items={list} checked={checked} onToggleMany={onToggleMany} />
              <Grid items={list} {...grid} />
            </div>
          ))}
        </div>
      ) : (
        <Grid items={items} {...grid} />
      )}
    </section>
  );
}
