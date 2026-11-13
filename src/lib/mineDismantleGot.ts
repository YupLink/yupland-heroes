// Тост разборки шахты (ПРАВИЛА §8.70, с 25.10 ресурсы — сразу на баланс):
// «Шахта разобрана. Получено: +90 дерева, +15 камня, +45 золота». Числа — как
// легли на счёт (до 0,0001); алмазы склоняются (1 алмаз, 2 алмаза, 0,6 алмаза),
// дерево, камень и золото — «сыпучие», как в письме турниров (tourLetterPrizes).
import type { Lang } from "@/lib/store";
import { MINE_V2_RESOURCES, type MineV2Resource } from "@/lib/mineV2";
import { ruPlural } from "@/lib/tourLetterText";

type Word = { ru: [string, string, string]; en: [string, string] };

const WORDS: Record<MineV2Resource, Word> = {
  wood: { ru: ["дерева", "дерева", "дерева"], en: ["wood", "wood"] },
  stone: { ru: ["камня", "камня", "камня"], en: ["stone", "stone"] },
  gold: { ru: ["золота", "золота", "золота"], en: ["gold", "gold"] },
  diamonds: { ru: ["алмаз", "алмаза", "алмазов"], en: ["diamond", "diamonds"] },
};

/** «+90 дерева, +15 камня, +0,6 алмаза»; en — «+90 wood, +0.6 diamonds». Пусто — "". */
export function dismantleGotText(got: Partial<Record<MineV2Resource, number>>, lang: Lang): string {
  const locale = lang === "en" ? "en-US" : "ru-RU";
  const parts: string[] = [];
  for (const res of MINE_V2_RESOURCES) {
    const n = Number(got[res]);
    if (!(Number.isFinite(n) && n > 0)) continue;
    const w = WORDS[res];
    const word = lang === "en" ? (n === 1 ? w.en[0] : w.en[1]) : ruPlural(n, ...w.ru);
    parts.push(`+${n.toLocaleString(locale, { maximumFractionDigits: 4 })} ${word}`);
  }
  return parts.join(", ");
}

type T = (key: string, params?: Record<string, string | number>) => string;

/** Текст тоста по ответу разборки: что легло на счёт и есть ли мешочек товаров. */
export function dismantleToastText(
  t: T,
  lang: Lang,
  res: { bag: string | null; got: Partial<Record<MineV2Resource, number>> },
): string {
  const what = dismantleGotText(res.got, lang);
  if (what) return t(res.bag ? "mine2.dismantled_got_bag" : "mine2.dismantled_got", { what });
  return t(res.bag ? "mine2.dismantled_toast" : "mine2.dismantled_plain");
}
