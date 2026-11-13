// Позиция цены у админа: что (выбор из listEnchantCostOptions с поиском по
// имени — руками код не вводится), сколько и «×» убрать. Строкой: на телефоне
// 360 px поле выбора тянется, количество и крестик фиксированы.
import { useState } from "react";
import { useT } from "@/lib/i18n";
import type { EnchantCost, EnchantCostOption } from "@/lib/enchant/enchant";
import { CostIcon } from "@/components/beta-raid/enchant/EnchantBits";
import { filterOptions } from "@/components/beta-raid/enchant/enchantDraft";

export function EnchantCostPick({
  value,
  options,
  onChange,
  onRemove,
}: {
  value: EnchantCost;
  options: EnchantCostOption[];
  onChange: (c: EnchantCost) => void;
  /** Нет — позиция одна (цена шага), крестика нет. */
  onRemove?: () => void;
}) {
  const t = useT();
  // null — не ищем: в поле имя выбранного; строка — идёт поиск, список открыт.
  const [q, setQ] = useState<string | null>(null);
  const cur = options.find((o) => o.kind === value.kind && o.code === value.code) ?? null;
  const shown = q === null ? [] : filterOptions(options, q);

  return (
    <div className={`ench-costrow${onRemove ? "" : " is-one"}`}>
      <div className="ench-combo">
        {cur && q === null && <CostIcon name={cur.name} image={cur.image} />}
        <input
          className={`ench-inp${cur ? "" : " is-bad"}`}
          role="combobox"
          aria-expanded={q !== null}
          aria-label={t("enchantshop.f_search")}
          placeholder={t("enchantshop.f_search")}
          value={q ?? cur?.name ?? ""}
          onFocus={() => setQ("")}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => setQ(null)}
          onKeyDown={(e) => e.key === "Escape" && setQ(null)}
        />
        {q !== null && (
          <div className="ench-combo-list" role="listbox">
            {shown.length === 0 ? (
              <p>{t("enchantshop.f_nothing")}</p>
            ) : (
              shown.map((o) => (
                <button
                  key={`${o.kind}:${o.code}`}
                  type="button"
                  role="option"
                  aria-selected={o === cur}
                  // mousedown, а не click: иначе blur поля закрыл бы список раньше выбора.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange({ kind: o.kind, code: o.code, amount: value.amount });
                    setQ(null);
                  }}
                >
                  <CostIcon name={o.name} image={o.image} />
                  {o.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      <input
        className="ench-inp"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        aria-label={t("enchantshop.f_amount")}
        value={value.amount}
        onChange={(e) =>
          onChange({ ...value, amount: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
        }
      />
      {onRemove && (
        <button
          type="button"
          className="ench-x"
          aria-label={t("enchantshop.f_remove")}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </div>
  );
}
