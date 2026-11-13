// Исход рецепта глазами игрока (ПРАВИЛА §8.104): подпись на его языке и
// картинка — по тем же правилам, что цена и товар на плитке (exchange.ts):
// ресурс — словарным словом и пиксельной иконкой, «любой арт редкости» —
// словарём, шаблон — своим именем и картинкой.
import type { RecipeOutcome } from "@/lib/marketRecipe";
import { marketResourceIconSrc } from "@/lib/resourceIcons";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { pctText } from "@/lib/raid/fishChances";
import type { Lang } from "@/lib/store";
import { artAnyIconSrc, artAnyRarity } from "./artAnyIcon";
import { numTextIn } from "./num";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Что показать в строке исхода. */
export type OutcomeFace = { label: string; image: string | null; pixel: boolean };

export function outcomeFace(
  o: Pick<RecipeOutcome, "kind" | "refId" | "name" | "image">,
  t: Translate,
  lang: Lang,
): OutcomeFace {
  if (o.kind === "none") return { label: t("recipe.none"), image: null, pixel: false };
  if (o.kind === "resource") {
    // Словарное слово цены пишется со строчной («2 алмазы») — в списке это имя.
    const word = t(`market.res.${o.refId}`);
    return {
      label: word.charAt(0).toUpperCase() + word.slice(1),
      image: marketResourceIconSrc(o.refId),
      pixel: true,
    };
  }
  const anyArt = o.kind === "art" ? artAnyRarity(o.refId) : null;
  if (anyArt) {
    return { label: t(`market.art_any.${anyArt}`), image: artAnyIconSrc(o.refId), pixel: false };
  }
  return { label: localizeAssetName(o.name, lang), image: o.image, pixel: false };
}

/** Исходы по убыванию шанса — так и в окне, и строкой на плитке. */
export const byChance = (list: readonly RecipeOutcome[]): RecipeOutcome[] =>
  [...list].sort((a, b) => b.pct - a.pct);

/** Строки на плитку: «Яблоко 50 %», «Алмазы ×10 1 %». */
export function recipeBrief(list: readonly RecipeOutcome[], t: Translate, lang: Lang): string[] {
  return byChance(list).map((o) => {
    const many = o.kind !== "none" && o.amount !== 1 ? ` ×${numTextIn(o.amount, lang)}` : "";
    return `${outcomeFace(o, t, lang).label}${many} ${pctText(o.pct, lang)}`;
  });
}
