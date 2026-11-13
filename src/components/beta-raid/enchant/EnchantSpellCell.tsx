// Заклинание: у игрока компактная карточка с бонусом, тремя исходами и ценой;
// у админа прежняя ячейка с полоской шансов и без сверки цены с запасом.
import { useLang, useT } from "@/lib/i18n";
import type { EnchantRarity } from "@/lib/enchant/enchant";
import { boostText, oddsText, type CostChip } from "@/components/beta-raid/enchant/enchantView";
import { CostChips, OddsBar } from "@/components/beta-raid/enchant/EnchantBits";

export function EnchantSpellCell({
  name,
  rarity,
  boost,
  odds,
  chips,
  pressed,
  player = false,
  onClick,
}: {
  name: string;
  rarity: EnchantRarity;
  /** null — усиление у админа набрано с ошибкой. */
  boost: [number, number] | null;
  odds: { success: number; none: number; destroy: number };
  chips: CostChip[];
  pressed: boolean;
  /** Вид игрока: редкость словом, ✓ и выделение выбранной. */
  player?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const chanceRows = [
    { key: "s", value: odds.success },
    { key: "n", value: odds.none },
    { key: "d", value: odds.destroy },
  ] as const;
  return (
    <button
      type="button"
      className={`ench-cell ench-spell ench-r-${rarity}${player ? " is-player" : ""}`}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {player && pressed && (
        <span className="ench-check" aria-hidden="true">
          ✓
        </span>
      )}
      {player ? (
        <>
          <span className="ench-rt">{t(`enchantshop.rarity_${rarity}`)}</span>
          <span className="ench-player-title">{name}</span>
          <span className="ench-player-bonus">
            <strong>{boost ? (boost[0] === 100 && boost[1] === 100 ? "+100%" : boostText(boost[0], boost[1])) : "—"}</strong>
            <span>{lang === "ru" ? "к характеристикам" : "to stats"}</span>
          </span>
          <span className="ench-player-odds">
            {chanceRows.map(({ key, value }) => (
              <span key={key} className={key === "d" ? "is-danger" : undefined}>
                <span>{t(`enchantshop.info_${key}`, { n: "" }).trim()}</span>
                <b>{oddsText(value)}</b>
              </span>
            ))}
          </span>
          <CostChips list={chips} />
        </>
      ) : (
        <>
          <span className="ench-eff">{boost ? boostText(boost[0], boost[1]) : "—"}</span>
          <span className="ench-rn">{name}</span>
          <OddsBar odds={odds} />
          <CostChips list={chips} />
        </>
      )}
    </button>
  );
}
