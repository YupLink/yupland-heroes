// «Можно получить» у рецепта (ПРАВИЛА §8.104): все исходы с шансами — до
// покупки, по кнопке «i» на плитке. Шторка — как у окна свойств товара
// (ItemInfoModal), чтобы рецепт не выглядел чужим на витрине.
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLang, useT } from "@/lib/i18n";
import { pctText } from "@/lib/raid/fishChances";
import type { RecipeOutcome } from "@/lib/marketRecipe";
import { numTextIn } from "./num";
import { byChance, outcomeFace } from "./recipeView";
import { RecipeOutcomeList } from "./RecipeOutcomeList";

export function RecipeInfoModal({
  name,
  outcomes,
  onClose,
}: {
  name: string;
  outcomes: readonly RecipeOutcome[];
  onClose: () => void;
}) {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const rows = byChance(outcomes).map((o) => {
    const face = outcomeFace(o, t, lang);
    const many = o.kind !== "none" && o.amount !== 1 ? ` ×${numTextIn(o.amount, lang)}` : "";
    return {
      key: o.id,
      face: { ...face, label: `${face.label}${many}` },
      right: pctText(o.pct, lang),
    };
  });
  const body = (
    <div
      className="fixed inset-0 z-[170] flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-3xl border border-gold/30 bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] sm:rounded-3xl sm:pb-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center gap-2">
          <b className="min-w-0 flex-1 whitespace-normal break-words">{name}</b>
          <button type="button" onClick={onClose} className="text-muted-foreground" aria-label="OK">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">{t("recipe.can_get")}</p>
        <RecipeOutcomeList rows={rows} />
      </div>
    </div>
  );
  return typeof document === "undefined" ? body : createPortal(body, document.body);
}
