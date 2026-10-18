// Карточка определения артефакта/героя в админке: арт, бейджи, три действия
// (выдать себе для проверки отображения, редактировать, удалить).
// Вынесено из ItemsAdminPanel при разбивке на модули (§13 ПРАВИЛА.md).
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Fish, PackagePlus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { thumb } from "@/lib/image";
import { useLang } from "@/lib/i18n";
import { humanError } from "@/lib/humanError";
import { fishBonusText } from "@/lib/raid/fishBonus";
import { StatBadge, ImmunityBadges } from "@/components/itemStat";
import { metaLabel, stripStatSuffix } from "@/components/heroMeta";
import { adminDeleteItem, adminGrantItem } from "@/server/api/items";
import { isUniqueItem, itemBadge, itemGlyph, itemRing, type ItemRow } from "./itemsAdminShared";
import { heroAbilityLabel, heroAbilityOf } from "@/lib/hero/heroAbilities";

export function ItemDefCard({
  it,
  onEdit,
  onChanged,
}: {
  it: ItemRow;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const lang = useLang();
  const ring = itemRing(it);
  const badge = itemBadge(it, lang);
  const grant = useMutation({
    mutationFn: () => adminGrantItem({ data: { templateId: it.id } }),
    onSuccess: () => toast.success("Выдано себе — смотри в Инвентаре"),
    onError: (e: Error) => toast.error(humanError(e)),
  });
  const del = useMutation({
    mutationFn: () => adminDeleteItem({ data: { id: it.id } }),
    onSuccess: () => {
      toast.success("Удалено");
      onChanged();
    },
    onError: (e: Error) => toast.error(humanError(e)),
  });

  return (
    <div
      className={cn("overflow-hidden rounded-2xl border bg-card", !it.active && "opacity-50")}
      style={{ borderColor: ring + "66" }}
    >
      <div
        className="relative aspect-square w-full bg-secondary/40"
        style={{ boxShadow: `inset 0 0 0 2px ${ring}55` }}
      >
        {it.imageUrl ? (
          <img src={thumb(it.imageUrl, 240)} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-2xl" style={{ color: ring }}>
            {itemGlyph(it)}
          </div>
        )}
        {badge && (
          <span
            className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold"
            style={{ background: ring + "22", color: ring }}
          >
            {badge}
          </span>
        )}
        {it.kind === "hero" && it.specialization && (
          <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
            {metaLabel(it.specialization, lang)}
          </span>
        )}
        {it.kind === "artifact" && it.statType && (
          <span className="absolute right-1.5 top-1.5">
            <StatBadge stat={it.statType} amount={it.statAmount} />
          </span>
        )}
        {/* Бонус к рыбалке — вторым значком под статом: у «рыбацких» артефактов
            именно он и есть смысл, а основной стат у них — Торговля. */}
        {it.kind === "artifact" && Number(it.fishBonusPct) > 0 && (
          <span className="absolute right-1.5 top-8 inline-flex items-center gap-0.5 rounded-full bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-sky-300">
            <Fish className="h-2.5 w-2.5" />
            {fishBonusText(Number(it.fishBonusPct), lang === "en" ? "en" : "ru")}
          </span>
        )}
        {/* Иммунитеты (резисты) — иконками снизу карточки */}
        {it.kind === "artifact" && (it.immunities?.length ?? 0) > 0 && (
          <ImmunityBadges
            immunities={it.immunities}
            lang={lang}
            className="absolute bottom-1.5 left-1.5"
          />
        )}
      </div>
      <div className="p-2">
        <div className="flex items-center gap-1">
          <span className="truncate text-xs font-semibold">{stripStatSuffix(it.name)}</span>
          {/* Уникальный герой: выпадает один раз (server heroes-unique). */}
          {isUniqueItem(it.meta) && (
            <span
              title="Уникальный — выпадает один раз"
              className="shrink-0 rounded px-1 text-[9px] font-bold text-gold ring-1 ring-gold/50"
            >
              1×
            </span>
          )}
        </div>
        {it.kind === "hero" && (it.race || it.specialization) && (
          <div className="truncate text-[10px] text-muted-foreground">
            {[it.race, it.specialization]
              .filter(Boolean)
              .map((v) => metaLabel(v, lang))
              .concat(heroAbilityLabel(heroAbilityOf(it.meta), lang) || [])
              .join(" · ")}
          </div>
        )}
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <button
            onClick={() => grant.mutate()}
            disabled={grant.isPending}
            title="Выдать себе"
            className="inline-flex items-center justify-center rounded-lg border border-gold/40 bg-gold/10 py-1 text-gold transition active:scale-95"
          >
            <PackagePlus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onEdit}
            title="Редактировать"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-secondary/40 py-1 text-muted-foreground transition hover:text-foreground active:scale-95"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm(`Удалить «${it.name}»? Также удалятся выданные экземпляры.`))
                del.mutate();
            }}
            disabled={del.isPending}
            title="Удалить"
            className="inline-flex items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 py-1 text-red-400 transition active:scale-95"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
