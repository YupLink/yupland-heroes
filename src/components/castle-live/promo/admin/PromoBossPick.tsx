// Выбор босса для промокода: шаблоны карты (raid_boss_template) — те же, что
// в палитре админа и редакторе карт. Картинка + имя, поиск по имени; список
// раскрывается под кнопкой (форма прокручивается своим телом).
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Skull } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { adminListBossTemplates } from "@/server/api/raid-admin";

export type BossPick = { id: string; name: string; image: string | null };

export function PromoBossPick({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (b: BossPick) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["promo-boss-templates"],
    queryFn: async (): Promise<BossPick[]> => {
      const { templates } = await adminListBossTemplates();
      return templates.map((b) => ({
        id: b.id,
        name: b.name,
        image: b.imageUrl || b.mapImageUrl || null,
      }));
    },
  });
  const shown = useMemo(() => {
    const all = list.data ?? [];
    const s = q.trim().toLowerCase();
    return s ? all.filter((b) => b.name.toLowerCase().includes(s)) : all;
  }, [list.data, q]);
  const current = (list.data ?? []).find((b) => b.id === value) ?? null;
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-left text-sm"
      >
        <Face src={current?.image ?? null} />
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-muted-foreground")}>
          {current?.name ?? t("promo.adm.pick_boss")}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background/60 p-1">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("promo.adm.pick_boss")}
            className="mb-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-base"
          />
          {list.isLoading && (
            <p className="p-2 text-xs text-muted-foreground">{t("promo.adm.loading")}</p>
          )}
          {shown.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                onPick(b);
                setOpen(false);
              }}
              className={cn(
                "flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-secondary",
                b.id === value && "bg-gold/15 font-semibold text-gold",
              )}
            >
              <Face src={b.image} />
              <span className="min-w-0 flex-1 truncate">{b.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Face({ src }: { src: string | null }) {
  if (src) return <img src={thumb(src, 48)} alt="" className="h-7 w-7 shrink-0 rounded object-contain" />;
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-secondary/60 text-orange-300">
      <Skull className="h-4 w-4" aria-hidden="true" />
    </span>
  );
}
