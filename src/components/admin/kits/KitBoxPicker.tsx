// Бокс набора — из созданных в конструкторе боксов: обложка + имя, поиск по
// имени. Кнопки, а не нативный <select> (в вебвью Xiaomi он не коммитил
// выбор). Список раскрывается под кнопкой, а не всплывает: форма прокручивается
// своим телом и обрезала бы всплывающий список (как TourPackSelect). Ключ кэша
// списка боксов — общий с конструктором и подпиской.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Gift, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { adminListMysticPacks } from "@/api";
import type { KitBoxRef } from "./kitDraft";

export function KitBoxPicker({
  value,
  onPick,
}: {
  value: KitBoxRef | null;
  onPick: (b: KitBoxRef) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["admin-mystic-packs"],
    queryFn: () => adminListMysticPacks(),
  });
  const boxes = useMemo(() => {
    const raw = Array.isArray(list.data) ? list.data : [];
    // Выключенный бокс новым набором не продаём, но уже выбранный — видно.
    const all = raw
      .filter((b) => b.active || b.id === value?.id)
      .map((b) => ({ id: b.id, name: b.name, image: b.coverImageUrl ?? null }));
    const s = q.trim().toLowerCase();
    return s ? all.filter((b) => b.name.toLowerCase().includes(s)) : all;
  }, [list.data, q, value?.id]);

  return (
    <div className="min-w-0 space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm"
      >
        <Cover src={value?.image ?? null} />
        <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
          {value ? value.name : t("kits.adm_pick_box")}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="space-y-1 rounded-lg border border-border bg-background/60 p-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("kits.adm_search")}
            className="h-9 w-full rounded-md border border-border bg-background px-2 text-base outline-none focus:border-gold/50"
          />
          <div className="max-h-64 overflow-y-auto overscroll-contain">
            {list.isLoading && (
              <div className="flex justify-center p-2">
                <Loader2 className="h-4 w-4 animate-spin text-gold" />
              </div>
            )}
            {boxes.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  onPick(b);
                  setOpen(false);
                  setQ("");
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary",
                  b.id === value?.id ? "bg-gold/15 font-semibold text-gold" : "text-foreground",
                )}
              >
                <Cover src={b.image} />
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Cover({ src }: { src: string | null }) {
  if (src) {
    return <img src={thumb(src, 48)} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />;
  }
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-secondary/60 text-gold">
      <Gift className="h-3.5 w-3.5" />
    </span>
  );
}
