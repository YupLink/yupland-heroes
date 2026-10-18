// Выбор своего товара (raid_custom_item, cst_…) для приза турнира: картинка +
// имя, поиск по имени. Список — тот же, что у маркета (listCustomItems), ключ
// кэша общий. Подарок «свой товар» кладёт его в рюкзак выбранного героя.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { listCustomItems } from "@/server/api/beta-raid/market-custom";

export type CustomPick = { id: string; name: string; image: string | null };

export function TourCustomSelect({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (p: CustomPick) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: ["market-custom-items"], queryFn: () => listCustomItems() });
  const items = useMemo(() => {
    const all = (list.data ?? []).map((c) => ({ id: c.id, name: c.name, image: c.image ?? null }));
    const s = q.trim().toLowerCase();
    return s ? all.filter((c) => c.name.toLowerCase().includes(s)) : all;
  }, [list.data, q]);
  const current = (list.data ?? []).find((c) => c.id === value);
  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-left text-sm"
      >
        {current?.image ? (
          <img src={thumb(current.image, 48)} alt="" className="h-6 w-6 rounded object-contain" />
        ) : (
          <Package className="h-5 w-5 text-muted-foreground" />
        )}
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-muted-foreground")}>
          {current?.name ?? t("tour.adm.pick_custom")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("tour.adm.pick_custom")}
            className="mb-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onPick(c);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary",
                c.id === value && "bg-gold/15 text-gold",
              )}
            >
              {c.image ? (
                <img src={thumb(c.image, 48)} alt="" className="h-6 w-6 rounded object-contain" />
              ) : (
                <Package className="h-5 w-5 text-muted-foreground" />
              )}
              <span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
