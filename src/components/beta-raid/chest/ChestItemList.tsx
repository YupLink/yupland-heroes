// Список предметов сундука с подписью: что ушло в «Добычу» после захвата,
// что ляжет в рюкзак и что пропадёт у «Забрать сундук». Пустой — не рисуем.
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { formatQty } from "@/lib/formatQty";

/** Строка списка: имя и картинка вида и сколько штук. */
export type ChestItemRow = { key: string; name: string; image: string | null; qty: number };

export function ChestItemList({
  title,
  rows,
  lost = false,
}: {
  title: string;
  rows: readonly ChestItemRow[];
  /** Пропадёт: минус и красным; иначе плюс и зелёным. */
  lost?: boolean;
}) {
  const lang = useLang();
  if (rows.length === 0) return null;
  return (
    <section className="space-y-1">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-md bg-secondary/40">
              {row.image ? (
                <img
                  src={thumb(row.image, 56, "black")}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Package className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <span className="min-w-0 flex-1 truncate text-xs">
              {localizeAssetName(row.name, lang)}
            </span>
            <span
              className={cn(
                "shrink-0 text-xs font-bold tabular-nums",
                lost ? "text-destructive" : "text-emerald-300",
              )}
            >
              {lost ? "−" : "+"}
              {formatQty(row.qty)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
