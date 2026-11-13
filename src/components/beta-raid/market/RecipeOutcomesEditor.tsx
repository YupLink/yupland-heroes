// Исходы рецепта в форме товара (админ; ПРАВИЛА §8.104): что может выпасть,
// сколько и с каким шансом. Список и пересчёт долей — общие с рыбалкой и
// находками лопатой (FishChances): сумма всегда 100 %, поднял одному —
// остальные ужались, добавил — потеснились все, убрал — его доля разошлась.
import { useState } from "react";
import { useT } from "@/lib/i18n";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import {
  RECIPE_MAX,
  RECIPE_RESOURCES,
  addRecipeOutcome,
  removeRecipeOutcome,
  setRecipeAmount,
  type RecipeKind,
  type RecipeOutcome,
} from "@/lib/marketRecipe";
import { RESOURCE_LABELS_RU } from "@/lib/marketItem";
import { FishChances } from "@/components/admin/fishing/FishChances";
import { MarketRefPicker } from "./MarketRefPicker";
import { NumField } from "./NumField";

const inp = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

/** Что добавить строкой: подписи админки (она на русском). */
const ADD_LABEL: Record<Exclude<RecipeKind, "none">, string> = {
  resource: "Ресурс",
  custom: "Свой товар",
  boss: "Босс",
  art: "Артефакт",
  hero: "Герой",
  pack: "Пак",
};

type PickKind = keyof typeof ADD_LABEL;

export function RecipeOutcomesEditor({
  value,
  onChange,
}: {
  value: RecipeOutcome[];
  onChange: (next: RecipeOutcome[]) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<PickKind>("custom");
  const [res, setRes] = useState<(typeof RECIPE_RESOURCES)[number]>("diamonds");
  const full = value.length >= RECIPE_MAX;
  const hasNone = value.some((o) => o.kind === "none");
  const add = (o: Omit<RecipeOutcome, "id" | "pct">) => onChange(addRecipeOutcome(value, o));
  const names = value.map((o) => ({
    id: o.id,
    name: o.kind === "none" ? t("recipe.none") : o.name,
    image: o.image ?? (o.kind === "resource" ? marketResourceIconSrc(o.refId) : null),
  }));

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-2">
      <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
        Что может выпасть
      </span>
      <FishChances
        items={value}
        all={names}
        onChange={(next) => {
          // FishChances пересчитал доли — переносим их в строки рецепта по ключу.
          const pct = new Map(next.map((n) => [n.id, n.pct]));
          onChange(value.map((o) => ({ ...o, pct: pct.get(o.id) ?? o.pct })));
        }}
        onRemove={(id) => onChange(removeRecipeOutcome(value, id))}
        extra={(id) => {
          const o = value.find((x) => x.id === id);
          if (!o || o.kind === "none") return null;
          return (
            <>
              <span className="text-[11px] text-muted-foreground">×</span>
              <NumField
                value={o.amount}
                integer={o.kind !== "resource"}
                onChange={(v) => onChange(setRecipeAmount(value, id, Math.max(0, v ?? 0)))}
                className="w-14 rounded-lg border border-border bg-background px-2 py-1 text-right text-xs tabular-nums"
              />
            </>
          );
        }}
      />
      {value.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Добавь хотя бы один приз.</p>
      )}
      {!full && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PickKind)}
            className={inp}
          >
            {(Object.keys(ADD_LABEL) as PickKind[]).map((k) => (
              <option key={k} value={k}>
                {ADD_LABEL[k]}
              </option>
            ))}
          </select>
          {kind === "resource" ? (
            <div className="flex gap-1">
              <select
                value={res}
                onChange={(e) => setRes(e.target.value as typeof res)}
                className={inp}
              >
                {RECIPE_RESOURCES.map((r) => (
                  <option key={r} value={r}>
                    {RESOURCE_LABELS_RU[r]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  add({
                    kind: "resource",
                    refId: res,
                    amount: 1,
                    name: RESOURCE_LABELS_RU[res],
                    image: null,
                  })
                }
                className="rounded-lg border border-gold/50 px-2 text-sm font-bold text-gold"
              >
                +
              </button>
            </div>
          ) : (
            <MarketRefPicker
              kind={kind}
              value={null}
              onPick={(ref) =>
                add({ kind, refId: ref.id, amount: 1, name: ref.name, image: ref.image })
              }
            />
          )}
        </div>
      )}
      {!full && !hasNone && (
        <button
          type="button"
          onClick={() => add({ kind: "none", refId: null, amount: 1, name: "", image: null })}
          className="w-full rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground"
        >
          + {t("recipe.none")}
        </button>
      )}
    </div>
  );
}
