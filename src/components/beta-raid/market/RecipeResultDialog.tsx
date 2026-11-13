// Окно «Выпало» после покупки рецепта (ПРАВИЛА §8.104): что легло и сколько.
// Слой 200 — поверх окна лавки на карте, как окно ломбарда (PawnDropDialog).
import { createPortal } from "react-dom";
import { useLang, useT } from "@/lib/i18n";
import { closeRecipePrizes, useRecipePrizes } from "./recipeResultBus";
import { numTextIn } from "./num";
import { outcomeFace } from "./recipeView";
import { RecipeOutcomeList } from "./RecipeOutcomeList";

export function RecipeResultDialog() {
  const t = useT();
  const lang = useLang() === "en" ? "en" : "ru";
  const prizes = useRecipePrizes();
  if (!prizes) return null;
  // «Ничего» — внизу: сначала то, что легло.
  const rows = [...prizes]
    .sort((a, b) => Number(a.kind === "none") - Number(b.kind === "none"))
    .map((p, i) => ({
      key: `${p.kind}:${p.refId ?? ""}:${i}`,
      face: outcomeFace(p, t, lang),
      right: `×${numTextIn(p.count, lang)}`,
    }));
  const node = (
    <div
      className="fixed inset-0 z-[200] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("recipe.result_title")}
    >
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border/60 bg-background p-4">
        <h2 className="text-center text-base font-bold text-gold">{t("recipe.result_title")}</h2>
        <RecipeOutcomeList rows={rows} />
        <button
          type="button"
          onClick={closeRecipePrizes}
          className="flex h-11 w-full items-center justify-center rounded-xl gradient-gold text-sm font-bold text-gold-foreground"
        >
          OK
        </button>
      </div>
    </div>
  );
  return typeof document === "undefined" ? node : createPortal(node, document.body);
}
