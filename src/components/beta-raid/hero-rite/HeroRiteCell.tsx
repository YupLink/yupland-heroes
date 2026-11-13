// Ячейка обряда — как ячейка заклинания лавки артефактов (EnchantSpellCell):
// крупно «3 → 1», что выйдет — редкость словом и рамка её цветом, название,
// полоска шансов (красная, если при неудаче кто-то пропадёт) и цена значками.
// Одна на игрока и админа; у игрока выбранная — со свечением и ✓.
import { useT } from "@/lib/i18n";
import { HERO_RITE_NEXT, type HeroRiteRarity } from "@/lib/enchant/heroRite";
import type { CostChip } from "@/components/beta-raid/enchant/enchantView";
import { CostChips, OddsBar } from "@/components/beta-raid/enchant/EnchantBits";

export function HeroRiteCell({
  name,
  rarity,
  need,
  odds,
  chips,
  pressed,
  player = false,
  onClick,
}: {
  name: string;
  rarity: HeroRiteRarity;
  need: number;
  odds: { success: number; none: number; destroy: number };
  chips: CostChip[];
  pressed: boolean;
  player?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const target = HERO_RITE_NEXT[rarity];
  return (
    <button
      type="button"
      className={`ench-cell ench-spell ench-r-${target}${player ? " is-player" : ""}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {player && pressed && (
        <span className="ench-check" aria-hidden="true">
          ✓
        </span>
      )}
      <span className="ench-eff">{need} → 1</span>
      <span className="ench-rt">{t(`herorite.r_${target}`)}</span>
      <span className="ench-rn">{name}</span>
      <OddsBar odds={odds} />
      <CostChips list={chips} />
    </button>
  );
}
