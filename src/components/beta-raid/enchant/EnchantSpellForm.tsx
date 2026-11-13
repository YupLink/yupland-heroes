// Форма заклинания у админа (вкладка «Админ» прототипа v3): название,
// редкость, усиление одним полем «20» / «50-90», успех ползунком, галка
// разрушения и его ползунок (≤ 100 − успех), цена списком позиций, галка
// «Можно усилить шанс» → % за шаг и цена 1-го шага, удалить.
import { useT } from "@/lib/i18n";
import {
  ENCHANT_FX_STEPS,
  ENCHANT_RARITIES,
  enchantStepCost,
  type EnchantCostOption,
} from "@/lib/enchant/enchant";
import { numText } from "@/components/beta-raid/market/num";
import {
  draftOdds,
  nextCost,
  parseBoost,
  type EnchantDraft,
} from "@/components/beta-raid/enchant/enchantDraft";
import { OddsBar } from "@/components/beta-raid/enchant/EnchantBits";
import { EnchantCostPick } from "@/components/beta-raid/enchant/EnchantCostPick";

export function EnchantSpellForm({
  d,
  options,
  onChange,
  onDelete,
}: {
  d: EnchantDraft;
  options: EnchantCostOption[];
  onChange: (d: EnchantDraft) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const set = (patch: Partial<EnchantDraft>) => onChange({ ...d, ...patch });
  const odds = draftOdds(d);
  const maxDestroy = 100 - d.success;
  const stepList = Array.from({ length: ENCHANT_FX_STEPS }, (_, i) =>
    numText(enchantStepCost({ ...d, boostMin: 0, boostMax: 0 }, i)),
  ).join(" · ");

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
        <span className="ench-lbl">{t("enchantshop.f_rarity")}</span>
        <div className="ench-seg">
          {ENCHANT_RARITIES.map((r) => (
            <button
              key={r}
              type="button"
              className={`ench-r-${r}`}
              aria-pressed={d.rarity === r}
              onClick={() => set({ rarity: r })}
            >
              {t(`enchantshop.rarity_${r}`)}
            </button>
          ))}
        </div>
      </div>

      <label className="ench-f">
        <span className="ench-lbl">{t("enchantshop.f_boost")}</span>
        <input
          className={`ench-inp${parseBoost(d.boost) ? "" : " is-bad"}`}
          inputMode="numeric"
          placeholder={t("enchantshop.f_boost_ph")}
          value={d.boost}
          onChange={(e) => set({ boost: e.target.value })}
        />
      </label>

      <label className="ench-f">
        <span className="ench-lbl">{t("enchantshop.f_success")}</span>
        <span className="ench-range">
          <input
            type="range"
            min={0}
            max={100}
            value={d.success}
            onChange={(e) => {
              const success = Number(e.target.value);
              set({ success, destroyChance: Math.min(d.destroyChance, 100 - success) });
            }}
          />
          <span className="ench-v">{d.success}%</span>
        </span>
      </label>

      <label className="ench-tick">
        <input
          type="checkbox"
          checked={d.destroy}
          onChange={(e) => set({ destroy: e.target.checked })}
        />
        {t("enchantshop.f_destroy")}
      </label>
      {d.destroy && (
        <label className="ench-f">
          <span className="ench-lbl">{t("enchantshop.f_destroy_chance")}</span>
          <span className="ench-range">
            <input
              type="range"
              min={0}
              max={maxDestroy}
              value={Math.min(d.destroyChance, maxDestroy)}
              onChange={(e) => set({ destroyChance: Number(e.target.value) })}
            />
            <span className="ench-v">{Math.round(odds.destroy)}%</span>
          </span>
        </label>
      )}
      <OddsBar odds={odds} />

      <div className="ench-f">
        <span className="ench-lbl">{t("enchantshop.f_cost")}</span>
        {d.cost.map((c, i) => (
          <EnchantCostPick
            key={i}
            value={c}
            options={options}
            onChange={(nc) => set({ cost: d.cost.map((x, j) => (j === i ? nc : x)) })}
            // Цена — хотя бы одна позиция: последнюю не убрать.
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

      <label className="ench-tick">
        <input
          type="checkbox"
          checked={d.fx.on}
          onChange={(e) => set({ fx: { ...d.fx, on: e.target.checked } })}
        />
        {t("enchantshop.f_fx")}
      </label>
      {d.fx.on && (
        <div className="ench-sub">
          <label className="ench-f">
            <span className="ench-lbl">{t("enchantshop.f_fx_pct")}</span>
            <input
              className="ench-inp"
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={d.fx.pct}
              onChange={(e) => {
                const pct = Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1)));
                set({ fx: { ...d.fx, pct } });
              }}
            />
          </label>
          <div className="ench-f">
            <span className="ench-lbl">{t("enchantshop.f_fx_cost")}</span>
            <EnchantCostPick
              value={d.fx.cost}
              options={options}
              onChange={(cost) => set({ fx: { ...d.fx, cost } })}
            />
          </div>
          <p className="ench-note">
            {t("enchantshop.f_fx_steps", { n: ENCHANT_FX_STEPS, list: stepList })}
          </p>
        </div>
      )}

      <button type="button" className="ench-danger" onClick={onDelete}>
        {t("enchantshop.f_delete")}
      </button>
    </div>
  );
}
