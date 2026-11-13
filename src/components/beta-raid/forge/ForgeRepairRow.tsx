// Строка окна ремонта (ПРАВИЛА §8.72): галочка, картинка с полосой износа, имя,
// редкость и на ком надет, цена. Тап по строке — выбрать/снять.
import { Check } from "lucide-react";
import { ArtWearBar } from "@/components/ArtWearBar";
import { EnchantMark } from "@/components/EnchantMark";
import { metaLabel, stripStatSuffix } from "@/components/heroMeta";
import { thumb } from "@/lib/image";
import { useLang, useT } from "@/lib/i18n";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { cn } from "@/lib/utils";
import type { ArtRepairItem, RepairCost, RepairRarity } from "@/lib/hero/artRepair";

const RING: Record<RepairRarity, string> = {
  common: "border-slate-400/50",
  rare: "border-sky-400/60",
  epic: "border-violet-400/60",
  legendary: "border-amber-300/70",
};

const ICON = { gold: "/resources/gold.webp", diamonds: "/resources/crystal.webp" } as const;
const fmt = (n: number) => n.toLocaleString("ru-RU");

/**
 * Цена ремонта с иконками ресурсов. withZero — показывать и нули (итог внизу
 * окна: золото и алмазы всегда отдельно); short — нехватка этого ресурса, красным.
 */
export function RepairCostLabel({
  cost,
  short,
  withZero = false,
  className,
}: {
  cost: RepairCost;
  short?: { gold: boolean; diamonds: boolean };
  withZero?: boolean;
  className?: string;
}) {
  const parts = (["gold", "diamonds"] as const).filter((k) => withZero || cost[k] > 0);
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-2 tabular-nums", className)}>
      {parts.map((k) => (
        <span
          key={k}
          data-short={short?.[k] ? "1" : undefined}
          className={cn("inline-flex items-center gap-1", short?.[k] && "text-destructive")}
        >
          <img
            src={ICON[k]}
            alt=""
            className="h-4 w-4 object-contain [image-rendering:pixelated]"
          />
          {fmt(cost[k])}
        </span>
      ))}
    </span>
  );
}

export function ForgeRepairRow({
  item,
  picked,
  disabled,
  onToggle,
}: {
  item: ArtRepairItem;
  picked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const name = stripStatSuffix(localizeAssetName(item.name, lang));
  const hero = item.heroName ? localizeAssetName(item.heroName, lang) : null;
  return (
    <button
      data-forge-repair-row=""
      type="button"
      role="checkbox"
      aria-checked={picked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-2xl border p-2 text-left transition-colors disabled:opacity-60",
        picked ? "border-gold/60 bg-gold/10" : "border-border/60 bg-secondary/20",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
          picked ? "border-gold bg-gold text-gold-foreground" : "border-muted-foreground/50",
        )}
      >
        {picked && <Check className="h-3.5 w-3.5" />}
      </span>
      <span
        className={cn(
          "relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border bg-black/40",
          RING[item.rarity],
        )}
      >
        {item.imageUrl && (
          <img src={thumb(item.imageUrl, 96)} alt="" className="h-full w-full object-cover" />
        )}
        {/* Полоса внутри скругления: у края её короткий красный хвост срезал бы угол. */}
        <ArtWearBar durability={item.durability} className="inset-x-1.5 bottom-1 rounded-full" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate text-sm font-semibold">{name}</span>
          <EnchantMark pct={item.enchantPct} show="pct" className="text-[11px]" />
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {metaLabel(item.rarity, lang)}
          {hero ? ` · ${t("artfix.worn_by", { name: hero })}` : ""}
        </span>
      </span>
      <RepairCostLabel cost={item.price} className="text-xs font-semibold" />
    </button>
  );
}
