// Выбор бокса для приза: мистик-боксы, чип-паки и NFT-паки одним списком.
//
// Списано с reward/PackPicker (кнопка + свой список вместо нативного <select>:
// в Telegram-вебвью Xiaomi нативный пикер не коммитил выбор), ключи кэша —
// те же. Своим файлом, потому что подарку нужны ещё имя и обложка
// (title/image приза), а PackPicker отдаёт только id; и боксы мистика
// PackPicker не показывает вовсе. Выдача у всех одна — подарок вида pack.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Gift } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { adminListChipPacks } from "@/server/api/chips-admin";
import { adminListPacks } from "@/server/api/packs";
import { adminListMysticPacks } from "@/server/api/mystic";

export type PackPick = { id: string; name: string; image: string | null };
type Opt = PackPick & { group: "box" | "chip" | "nft" };

const GROUPS = ["box", "chip", "nft"] as const;

export function TourPackSelect({
  value,
  onPick,
}: {
  value: string | null;
  onPick: (p: PackPick) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const boxes = useQuery({
    queryKey: ["admin-mystic-packs"],
    queryFn: () => adminListMysticPacks(),
  });
  const chip = useQuery({
    queryKey: ["admin", "chip-packs", "all"],
    queryFn: () => adminListChipPacks(),
  });
  const nft = useQuery({
    queryKey: ["admin", "packs", "active-only"],
    queryFn: () => adminListPacks({ data: { activeOnly: true } }),
  });
  // Неактивное и исчерпанное как приз не предлагаем, но уже выбранное
  // оставляем видимым — как у PackPicker.
  const keep = (id: string, ok: boolean) => ok || id === value;
  const options: Opt[] = [
    ...(boxes.data ?? [])
      .filter((p) => keep(p.id, p.active))
      .map((p) => ({
        id: p.id,
        name: p.name,
        image: p.coverImageUrl ?? null,
        group: "box" as const,
      })),
    ...(chip.data ?? [])
      .filter((p) => keep(p.id, p.active && !p.exhausted))
      .map((p) => ({
        id: p.id,
        name: p.name,
        image: p.coverImageUrl ?? null,
        group: "chip" as const,
      })),
    ...(nft.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      image: p.imageUrl ?? null,
      group: "nft" as const,
    })),
  ];
  const current = options.find((o) => o.id === value) ?? null;
  const loading = boxes.isLoading || chip.isLoading || nft.isLoading;

  // Список раскрывается под кнопкой, а не всплывает: форма прокручивается
  // своим телом и обрезала бы всплывающий список (как у ItemPickerSelect).
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm"
      >
        <Cover src={current?.image ?? null} />
        <span className={cn("min-w-0 flex-1 truncate", !current && "text-muted-foreground")}>
          {current ? current.name : t("tour.adm.pick_pack")}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background/60 p-1">
          {loading && <p className="p-2 text-xs text-muted-foreground">{t("tour.adm.loading")}</p>}
          {GROUPS.map((grp) => {
            const items = options.filter((o) => o.group === grp);
            if (items.length === 0) return null;
            return (
              <div key={grp}>
                <div className="px-2.5 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(`tour.adm.group_${grp}`)}
                </div>
                {items.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      onPick({ id: o.id, name: o.name, image: o.image });
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary",
                      o.id === value ? "bg-gold/15 font-semibold text-gold" : "text-foreground",
                    )}
                  >
                    <Cover src={o.image} />
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                  </button>
                ))}
              </div>
            );
          })}
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
