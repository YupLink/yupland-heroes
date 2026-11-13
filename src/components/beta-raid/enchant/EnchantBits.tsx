// Мелкие куски окна зачарования: чип цены (значок + число, красный — не
// хватает) и полоска шансов «успех / без изменений / разрушение».
import { thumb } from "@/lib/image";
import { useT } from "@/lib/i18n";
import { numText } from "@/components/beta-raid/market/num";
import type { CostChip } from "@/components/beta-raid/enchant/enchantView";

/** Значок позиции цены; без картинки — первые буквы имени. */
export function CostIcon({ name, image }: { name: string; image: string | null }) {
  return image ? (
    <img className="ench-ico" src={thumb(image, 48)} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className="ench-ico is-txt" aria-hidden="true">
      {name.slice(0, 2)}
    </span>
  );
}

export function CostChipView({ c }: { c: CostChip }) {
  return (
    <span className={`ench-chip${c.short ? " is-short" : ""}`} title={c.name}>
      <CostIcon name={c.name} image={c.image} />
      {numText(c.amount)}
    </span>
  );
}

export function CostChips({
  list,
  className = "ench-costs",
}: {
  list: CostChip[];
  className?: string;
}) {
  return (
    <span className={className}>
      {list.map((c) => (
        <CostChipView key={c.key} c={c} />
      ))}
    </span>
  );
}

/** Полоска исходов: ширины — проценты шансов (сумма 100). */
export function OddsBar({ odds }: { odds: { success: number; none: number; destroy: number } }) {
  const t = useT();
  const r = (n: number) => Math.round(n);
  return (
    <span
      className="ench-bar"
      role="img"
      aria-label={t("enchantshop.odds", {
        s: r(odds.success),
        n: r(odds.none),
        d: r(odds.destroy),
      })}
    >
      <i className="is-s" style={{ width: `${odds.success}%` }} />
      <i className="is-n" style={{ width: `${odds.none}%` }} />
      <i className="is-d" style={{ width: `${odds.destroy}%` }} />
    </span>
  );
}
