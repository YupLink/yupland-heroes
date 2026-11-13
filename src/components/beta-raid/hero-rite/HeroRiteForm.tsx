// Форма обряда у админа: название, какие герои (редкие → эпический, эпические →
// легендарный), сколько героев (2…10, выбор из списка), успех ползунком,
// «пропадёт при неудаче» одним полем «1» / «1-2», цена списком позиций, удалить.
import { useT } from "@/lib/i18n";
import {
  HERO_RITE_NEEDS,
  HERO_RITE_NEXT,
  HERO_RITE_RARITIES,
  parseLose,
} from "@/lib/enchant/heroRite";
import type { EnchantCostOption } from "@/lib/enchant/enchant";
import { nextCost } from "@/components/beta-raid/enchant/enchantDraft";
import { OddsBar } from "@/components/beta-raid/enchant/EnchantBits";
import { EnchantCostPick } from "@/components/beta-raid/enchant/EnchantCostPick";
import { riteDraftOdds, type RiteDraft } from "@/components/beta-raid/hero-rite/heroRiteDraft";

export function HeroRiteForm({
  d,
  options,
  onChange,
  onDelete,
}: {
  d: RiteDraft;
  options: EnchantCostOption[];
  onChange: (d: RiteDraft) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const set = (patch: Partial<RiteDraft>) => onChange({ ...d, ...patch });

  return (
    <div className="ench-form">
      <label className="ench-f">
        <span className="ench-lbl">{t("enchantshop.f_name")}</span>
        <input
          className={`ench-inp${d.name.trim() ? "" : " is-bad"}`}
          maxLength={30}
          value={d.name}
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>

      <div className="ench-f">
        <span className="ench-lbl">{t("herorite.f_from")}</span>
        <div className="ench-seg hrite-seg-from">
          {HERO_RITE_RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              className={`ench-r-${HERO_RITE_NEXT[r]}`}
              aria-pressed={d.rarity === r}
              onClick={() => set({ rarity: r })}
            >
              {t(`herorite.r_${r}`)} → {t(`herorite.r_${HERO_RITE_NEXT[r]}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="ench-f">
        <span className="ench-lbl">{t("herorite.f_need")}</span>
        <div className="ench-seg hrite-seg-need">
          {HERO_RITE_NEEDS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={d.need === n}
              onClick={() => set({ need: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <label className="ench-f">
        <span className="ench-lbl">{t("enchantshop.f_success")}</span>
        <span className="ench-range">
          <input
            type="range"
            min={0}
            max={100}
            value={d.success}
            onChange={(e) => set({ success: Number(e.target.value) })}
          />
          <span className="ench-v">{d.success}%</span>
        </span>
      </label>

      <label className="ench-f">
        <span className="ench-lbl">{t("herorite.f_lose")}</span>
        <input
          className={`ench-inp${parseLose(d.lose, d.need) ? "" : " is-bad"}`}
          inputMode="numeric"
          placeholder={t("herorite.f_lose_ph")}
          value={d.lose}
          onChange={(e) => set({ lose: e.target.value })}
        />
      </label>
      <OddsBar odds={riteDraftOdds(d)} />

      <div className="ench-f">
        <span className="ench-lbl">{t("enchantshop.f_cost")}</span>
        {d.cost.map((c, i) => (
          <EnchantCostPick
            key={i}
            value={c}
            options={options}
            onChange={(nc) => set({ cost: d.cost.map((x, j) => (j === i ? nc : x)) })}
            onRemove={
              d.cost.length > 1 ? () => set({ cost: d.cost.filter((_, j) => j !== i) }) : undefined
            }
          />
        ))}
        <button
          type="button"
          className="ench-add"
          onClick={() => set({ cost: [...d.cost, nextCost(d.cost, options)] })}
        >
          {t("enchantshop.f_add_cost")}
        </button>
      </div>

      <button type="button" className="ench-danger" onClick={onDelete}>
        {t("herorite.f_delete")}
      </button>
    </div>
  );
}
