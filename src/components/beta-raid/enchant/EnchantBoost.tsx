// Усиление шанса — только у заклинания с fx.on. Кнопки − / + от «Без
// усиления» до ENCHANT_FX_STEPS шагов; шанс «было → стало», полоска исходов с
// учётом шагов и цена шагов (amount × (2^k − 1)), не хватает — красным.
import { useT } from "@/lib/i18n";
import { ENCHANT_FX_STEPS, enchantOdds, type EnchantSpellView } from "@/lib/enchant/enchant";
import {
  costChips,
  nextSteps,
  pctText,
  stepsAmount,
} from "@/components/beta-raid/enchant/enchantView";
import { CostChips, OddsBar } from "@/components/beta-raid/enchant/EnchantBits";

export function EnchantBoost({
  spell,
  steps,
  onSteps,
}: {
  spell: EnchantSpellView;
  steps: number;
  onSteps: (n: number) => void;
}) {
  const t = useT();
  const was = enchantOdds(spell, 0);
  const now = enchantOdds(spell, steps);
  const fxCost = spell.fx.cost;
  const chips = costChips(
    [{ kind: fxCost.kind, code: fxCost.code, amount: stepsAmount(spell, steps) }],
    [fxCost],
    true,
  );

  return (
    <div className="ench-boost">
      <div className="ench-boost-head">
        <span>{t("enchantshop.chance")}</span>
        <b>
          {pctText(was.success)}
          {steps > 0 && ` → ${pctText(now.success)}`}
        </b>
      </div>
      <OddsBar odds={now} />
      <div className="ench-stepper">
        <button
          type="button"
          aria-label={t("enchantshop.less")}
          disabled={steps === 0}
          onClick={() => onSteps(nextSteps(spell, steps, -1))}
        >
          −
        </button>
        <div className="ench-lvl">
          {steps > 0 ? (
            <>
              <b>+{spell.fx.pct * steps}%</b>
              <CostChips list={chips} />
            </>
          ) : (
            <b>{t("enchantshop.no_boost")}</b>
          )}
        </div>
        <button
          type="button"
          aria-label={t("enchantshop.more")}
          disabled={steps >= ENCHANT_FX_STEPS}
          onClick={() => onSteps(nextSteps(spell, steps, 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}
