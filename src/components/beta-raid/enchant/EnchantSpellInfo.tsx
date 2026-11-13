// Инфо выбранного заклинания под ячейками (владелец, 28.10.2026): название
// цветом редкости и рядом редкость словом, что делает («Усиление всех
// характеристик артефакта: +10%», «от −20% до +50%», «×2»), при выбранном
// артефакте — его статы «было → стало при успехе», и шансы текстом — с шагами
// усиления уже пересчитанные. Разрушение — красным и только если оно есть;
// тогда же предупреждение «может исчезнуть навсегда». Полоска в ячейках — как была.
import { Fragment } from "react";
import { useT } from "@/lib/i18n";
import { enchantOdds, type EnchantSpell } from "@/lib/enchant/enchant";
import { boostInfo, oddsLine } from "@/components/beta-raid/enchant/enchantView";
import { EnchantStatPreview } from "@/components/beta-raid/enchant/EnchantStatPreview";

export function EnchantSpellInfo({
  spell,
  steps,
  stats = null,
}: {
  spell: EnchantSpell;
  steps: number;
  /** Статы выбранного артефакта; null — артефакт не выбран, превью нет. */
  stats?: Record<string, number> | null;
}) {
  const t = useT();
  const eff = boostInfo(spell.boostMin, spell.boostMax);
  const v = typeof eff === "string" ? eff : t("enchantshop.info_range", { a: eff[0], b: eff[1] });
  const { parts, warn } = oddsLine(enchantOdds(spell, steps));

  return (
    <div className={`ench-info ench-r-${spell.rarity}`}>
      <div className="ench-info-h">
        <h5>{spell.name}</h5>
        <span className="ench-rt">{t(`enchantshop.rarity_${spell.rarity}`)}</span>
      </div>
      <p>{t("enchantshop.info_effect", { v })}</p>
      {stats && <EnchantStatPreview stats={stats} min={spell.boostMin} max={spell.boostMax} />}
      <p>
        {parts.map((p, i) => (
          <Fragment key={p.key}>
            {i > 0 && " · "}
            <span className={`is-${p.key}`}>{t(`enchantshop.info_${p.key}`, { n: p.text })}</span>
          </Fragment>
        ))}
      </p>
      {warn && <p className="ench-warn">{t("enchantshop.info_warn")}</p>}
    </div>
  );
}
