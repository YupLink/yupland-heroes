// Письмо о турнирах — чистая сборка текста для генератора админки
// (src/components/admin/letters/TourLetterGen*).
//
// Слово владельца (04.10.2026): «кнопка сгенерировать письмо пользователям» по
// турнирам, которые скоро начнутся; своё название серии («9 королей») — если
// нужно; в письме — какие турниры, начало и конец, фонд и призы, запись в
// аренах и цена записи. Письмо показывается админу, он правит и отправляет.
//
// Эталон — письмо «9 королей», одобренное владельцем: что у всех турниров
// общее (срок, призы, цена), пишется один раз; что разное — у каждого турнира
// в его абзаце. Ничего не украшаем: только факты из базы.
import type { TourBand, TourEntryPrice, TourMetric } from "@/lib/tournament/types";
import { dict as tourDict } from "@/lib/translations/tournament";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { priceSentence, prizesSentence } from "@/lib/tourLetterPrizes";
import {
  hasCyrillic,
  METRIC_GOAL,
  ruPlural,
  termText,
  type LetterLang,
} from "@/lib/tourLetterText";

/** Турнир для письма. Время — ISO UTC; нет конца — «на N дней». */
export type TourLetterTour = {
  name: string;
  metric: TourMetric;
  startAt: string | null;
  endAt: string | null;
  days: number;
  fundDarai: number;
  bands: TourBand[];
  /** Цена записи: все строки разом; пусто — бесплатно. */
  entryPrice: TourEntryPrice[];
};

export type TourLetterInput = {
  /** Название серии («9 королей»); пусто — по имени турнира или «Объявлены турниры». */
  series: string | null;
  tournaments: TourLetterTour[];
  /** Имена построек, где записываются (поведение «Турнир»). */
  arenas: string[];
};

export type TourLetter = { title: string; body: string };

/** Турнир в выборе генератора: всё для письма + id и статус для галочек. */
export type TourLetterSourceRow = TourLetterTour & { id: string; status: "draft" | "running" };
export type TourLetterSource = { tours: TourLetterSourceRow[]; arenas: string[] };

const metricLabel = (m: TourMetric, lang: LetterLang): string =>
  tourDict[`tour.metric.${m}`]?.[lang] ?? m;

/** Имя турнира: админ пишет его по-русски — в английском письме берём категорию. */
function tourName(t: TourLetterTour, lang: LetterLang): string {
  const name = t.name.trim();
  if (lang === "ru") return name || metricLabel(t.metric, "ru");
  return name && !hasCyrillic(name) ? name : metricLabel(t.metric, "en");
}

function letterTitle(input: TourLetterInput, lang: LetterLang): string {
  // Поле серии одно, и админ пишет её по-русски («9 королей»): кириллицу в
  // английский заголовок не несём — как у имени турнира (tourName).
  const raw = (input.series ?? "").trim();
  const series = lang === "en" && hasCyrillic(raw) ? "" : raw;
  const only = input.tournaments.length === 1 ? tourName(input.tournaments[0], lang) : "";
  const named = series || only;
  if (lang === "ru") return named ? `Объявлен турнир «${named}»` : "Объявлены турниры";
  return named ? `Tournament “${named}” announced` : "Tournaments announced";
}

/** «• Урон — кто нанесёт больше урона». */
function bullet(t: TourLetterTour, lang: LetterLang): string {
  const goal = METRIC_GOAL[t.metric]?.[lang];
  return goal ? `• ${tourName(t, lang)} — ${goal}` : `• ${tourName(t, lang)}`;
}

/** «Запись — в здании «Арена».»; нет арен — «в здании с турнирами». */
function arenaSentence(arenas: readonly string[], lang: LetterLang): string {
  const names = [...new Set(arenas.map((a) => a.trim()).filter(Boolean))];
  if (lang === "ru") {
    if (names.length === 0) return "Запись — в здании с турнирами.";
    const q = names.map((a) => `«${a}»`).join(", ");
    return names.length === 1 ? `Запись — в здании ${q}.` : `Запись — в зданиях ${q}.`;
  }
  if (names.length === 0) return "Sign up at the tournament building.";
  const q = names.map((a) => `“${localizeAssetName(a, "en")}”`).join(", ");
  return `Sign up at the ${q} building${names.length === 1 ? "" : "s"}.`;
}

const allSame = (list: readonly string[]): boolean => list.every((s) => s === list[0]);

/** Заголовок и текст письма на одном языке; абзацы — через пустую строку (letterParagraphs). */
export function buildTourLetter(input: TourLetterInput, lang: LetterLang): TourLetter {
  const tours = input.tournaments;
  const n = tours.length;
  const many = n > 1;
  // Одинаковость сравниваем готовым текстом: что игрок прочтёт одинаково, то
  // и есть одинаковое (подпись «Золото» у приза-ресурса, например, не в счёт).
  const terms = tours.map((t) => termText(t, lang));
  const prizes = tours.map((t) => prizesSentence(t, lang, false));
  const prices = tours.map((t) => priceSentence(t.entryPrice, lang, false));
  const sameTerm = allSame(terms);
  const samePrize = allSame(prizes);
  const samePrice = allSame(prices);

  const paras: string[] = [];
  // «Одновременно» — только при общем сроке: у разных сроков это неправда.
  if (many) {
    const ru = `${n} ${ruPlural(n, "турнир", "турнира", "турниров")}`;
    if (lang === "ru") paras.push(sameTerm ? `${ru} одновременно.` : `${ru}.`);
    else paras.push(sameTerm ? `${n} tournaments at the same time.` : `${n} tournaments.`);
  }
  if (n > 0 && sameTerm) paras.push(terms[0]);
  if (sameTerm && samePrize && samePrice) {
    if (n > 0) paras.push(tours.map((t) => bullet(t, lang)).join("\n"));
  } else {
    tours.forEach((t, i) => {
      const lines = [bullet(t, lang)];
      if (!sameTerm) lines.push(terms[i]);
      if (!samePrize) lines.push(prizes[i]);
      if (!samePrice) lines.push(prices[i]);
      paras.push(lines.join("\n"));
    });
  }
  if (n > 0 && samePrize) paras.push(prizesSentence(tours[0], lang, many));

  const entry = [arenaSentence(input.arenas, lang)];
  if (n > 0 && samePrice) entry.push(priceSentence(tours[0].entryPrice, lang, many));
  const last =
    lang === "ru" ? "Очки считаются только после записи." : "Points count only after you sign up.";
  paras.push(`${entry.join(" ")}\n${last}`);

  return { title: letterTitle(input, lang), body: paras.join("\n\n") };
}
