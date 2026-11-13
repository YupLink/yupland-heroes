// Призы и цена записи словами для письма о турнирах (tourLetter.ts):
// «1 место — 27,3 млн DARAI, 50 000 золота и легендарный артефакт»,
// «Цена записи — 5 золота за каждый турнир.» — ru и en.
//
// Виды призов и «артефакт по редкости» — те же, что у подарка
// (tournament/prizeText.ts): письмо обещает ровно то, что выдаст финиш.
import { goldForEarnedTickets } from "@/lib/ticketGold";
import type { PortalPrice } from "@/lib/portal";
import { parsePlaces } from "@/lib/tournament/places";
import { artRarityOf } from "@/lib/tournament/prizeText";
import { TOUR_DARAI, type TourBand, type TourPrize } from "@/lib/tournament/types";
import { localizeAssetName } from "@/lib/translations/assetNames";
import { andList, letterNum, ruCount, ruPlural, type LetterLang } from "@/lib/tourLetterText";

type Word = { ru: [string, string, string]; en: [string, string] };

/** Счётные ресурсы: ru — 1 / 2 / 5, en — 1 / много. Золото и прочее «сыпучее» не склоняется. */
const WORDS: Record<string, Word> = {
  gold: { ru: ["золота", "золота", "золота"], en: ["gold", "gold"] },
  wood: { ru: ["дерева", "дерева", "дерева"], en: ["wood", "wood"] },
  stone: { ru: ["камня", "камня", "камня"], en: ["stone", "stone"] },
  diamonds: { ru: ["алмаз", "алмаза", "алмазов"], en: ["diamond", "diamonds"] },
  energy: { ru: ["энергии", "энергии", "энергии"], en: ["energy", "energy"] },
  likes: { ru: ["лайк", "лайка", "лайков"], en: ["like", "likes"] },
  tickets: { ru: ["билет", "билета", "билетов"], en: ["ticket", "tickets"] },
};

function counted(n: number, w: Word, lang: LetterLang): string {
  if (lang === "ru") return ruCount(n, ...w.ru);
  return `${letterNum(n, "en")} ${n === 1 ? w.en[0] : w.en[1]}`;
}

const tokenName = (sym: string | null | undefined): string =>
  !sym ? "" : sym === TOUR_DARAI ? "DARAI" : sym;

/** Штучное с именем: «Пак „Лес“», «Пак „Лес“ ×2». Имя — из базы по-русски, en — переводом имён объектов. */
function named(name: string, n: number, lang: LetterLang): string {
  const shown = lang === "en" ? localizeAssetName(name, "en") : name;
  return n === 1 ? shown : `${shown} ×${letterNum(n, lang)}`;
}

const RARITY: Record<string, { ru: [string, string]; en: string }> = {
  legendary: { ru: ["легендарный", "легендарных"], en: "legendary" },
  epic: { ru: ["эпический", "эпических"], en: "epic" },
  rare: { ru: ["редкий", "редких"], en: "rare" },
  common: { ru: ["обычный", "обычных"], en: "common" },
};

/** «легендарный артефакт», «2 эпических артефакта»; en — «a legendary artifact», «2 epic artifacts». */
function rarityArt(rarity: string, n: number, lang: LetterLang): string {
  const r = RARITY[rarity] ?? RARITY.common;
  if (lang === "en") {
    if (n !== 1) return `${letterNum(n, "en")} ${r.en} artifacts`;
    return `${/^[aeiou]/.test(r.en) ? "an" : "a"} ${r.en} artifact`;
  }
  if (n === 1) return `${r.ru[0]} артефакт`;
  // «21 легендарный артефакт», но «2 легендарных артефакта».
  const word = ruPlural(n, "артефакт", "артефакта", "артефактов");
  return `${letterNum(n, "ru")} ${word === "артефакт" ? r.ru[0] : r.ru[1]} ${word}`;
}

const KIND_NAME: Record<string, Record<LetterLang, string>> = {
  pack: { ru: "пак", en: "pack" },
  art: { ru: "артефакт", en: "artifact" },
  item: { ru: "предмет", en: "item" },
  hero: { ru: "герой", en: "hero" },
  custom: { ru: "товар", en: "item" },
};

/** Один приз словами — так, как его выдаст подарок. */
export function letterPrize(p: TourPrize, lang: LetterLang): string {
  const n = Number(p.amount) || 0;
  const ref = String(p.refId ?? "");
  if (p.kind === "token") return `${letterNum(n, lang)} ${tokenName(ref)}`.trim();
  if (p.kind === "resource") {
    const w = WORDS[ref];
    return w ? counted(n, w, lang) : `${letterNum(n, lang)} ${p.title || ref}`;
  }
  if (p.kind === "tickets") return counted(goldForEarnedTickets(n), WORDS.gold, lang);
  if (p.kind === "energy" || p.kind === "likes") return counted(n, WORDS[p.kind], lang);
  const rarity = p.kind === "art" ? artRarityOf(ref) : null;
  if (rarity) return rarityArt(rarity, n, lang);
  return named(p.title || ref || KIND_NAME[p.kind]?.[lang] || p.kind, n, lang);
}

/** «1 место», «2–3 места» / «place 1», «places 2–3». */
function placeLabel(raw: string, lang: LetterLang): string {
  const r = parsePlaces(raw);
  if (!r) return raw;
  if (r.from === r.to) return lang === "ru" ? `${r.from} место` : `place ${r.from}`;
  return lang === "ru" ? `${r.from}–${r.to} места` : `places ${r.from}–${r.to}`;
}

/**
 * «2–3 места — каждому 13,6 млн DARAI…» / «places 2–3 — 13.6M DARAI… each»:
 * приз строки выдаётся КАЖДОМУ месту диапазона (финиш), а не делится на них.
 */
function bandText(b: TourBand, lang: LetterLang): string {
  const r = parsePlaces(b.places);
  const list = andList(
    b.prizes.map((p) => letterPrize(p, lang)),
    lang,
  );
  const each = !r || r.to <= r.from ? list : lang === "ru" ? `каждому ${list}` : `${list} each`;
  return `${placeLabel(b.places, lang)} — ${each}`;
}

/** Призы по местам одной строкой, места по порядку (админ мог ввести «4-10» раньше «1»). */
export function bandsText(bands: readonly TourBand[], lang: LetterLang): string {
  const from = (b: TourBand) => parsePlaces(b.places)?.from ?? Number.MAX_SAFE_INTEGER;
  return [...bands]
    .sort((a, b) => from(a) - from(b))
    .map((b) => bandText(b, lang))
    .join("; ");
}

/**
 * Фонд и призы предложением. each — «В каждом турнире фонд …» (у всех
 * одинаково), иначе — про один турнир. Фонда нет — только призы.
 */
export function prizesSentence(
  t: { fundDarai: number; bands: readonly TourBand[] },
  lang: LetterLang,
  each: boolean,
): string {
  if (t.bands.length === 0) return lang === "ru" ? "Без призов." : "No prizes.";
  const list = bandsText(t.bands, lang);
  const fund = Number(t.fundDarai) || 0;
  if (lang === "ru") {
    if (fund <= 0) return each ? `Призы в каждом турнире: ${list}.` : `Призы: ${list}.`;
    const head = each ? "В каждом турнире фонд" : "Фонд";
    return `${head} ${letterNum(fund, "ru")} DARAI. Призы: ${list}.`;
  }
  if (fund <= 0) return each ? `Prizes in each tournament: ${list}.` : `Prizes: ${list}.`;
  const head = each
    ? `Each tournament has a ${letterNum(fund, "en")} DARAI prize pool.`
    : `Prize pool: ${letterNum(fund, "en")} DARAI.`;
  return `${head} Prizes: ${list}.`;
}

/** Цена записи словами: «5 золота и 10 USDT»; пусто (или всё по нулям) — null, запись бесплатная. */
export function letterPrice(list: readonly PortalPrice[], lang: LetterLang): string | null {
  const parts = list
    .filter((p) => Number(p.amount) > 0)
    .map((p) => {
      const n = Number(p.amount);
      if (p.resource === "item")
        return named(p.itemName || (lang === "ru" ? "товар" : "item"), n, lang);
      if (p.resource === "token") return `${letterNum(n, lang)} ${tokenName(p.token)}`.trim();
      const w = WORDS[p.resource];
      return w ? counted(n, w, lang) : `${letterNum(n, lang)} ${p.resource}`;
    });
  return parts.length ? andList(parts, lang) : null;
}

/** «Цена записи — 5 золота за каждый турнир.» / «Запись бесплатная.» */
export function priceSentence(
  list: readonly PortalPrice[],
  lang: LetterLang,
  each: boolean,
): string {
  const price = letterPrice(list, lang);
  if (!price) return lang === "ru" ? "Запись бесплатная." : "Entry is free.";
  if (lang === "ru") return `Цена записи — ${price}${each ? " за каждый турнир" : ""}.`;
  return `Entry fee — ${price}${each ? " per tournament" : ""}.`;
}
