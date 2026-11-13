// Черновик формы турнира: поля строками (как их отдаёт ввод) ↔ строки мест и
// призов для сервера (TourBand[]). Чистая логика без React — под тест.
//
// Места — одно поле «1» или «2-3» (правило проекта: диапазон одним полем);
// проверку строк делает общий bandsError, чтобы админка и сервер отказывали
// одним и тем же ключом tour.err.*.
import { bandsError, parsePlaces } from "@/lib/tournament/places";
import { prizeError } from "@/lib/tournament/prizeText";
import { cleanEntryPrice, tourEntryPriceError } from "@/lib/tournament/entryPrice";
import { isoOfUtcInput, scheduleError, spanDays, utcInputOf } from "./tourSchedule";
import {
  TOUR_DARAI,
  TOUR_DEFAULT_DAYS,
  TOUR_DEFAULT_ENTRY_PRICE,
  TOUR_MAX_DAYS,
  type TourAdminRow,
  type TourBand,
  type TourEntryPrice,
  type TourMetric,
  type TourPrize,
  type TourPrizeKind,
} from "@/lib/tournament/types";

export type PrizeDraft = {
  kind: TourPrizeKind;
  amount: string;
  refId: string | null;
  title: string | null;
  image: string | null;
  /** Только форма: редкость, по которой выбран конкретный артефакт («Артефакт
   *  по редкости» → конкретный): refId у него — id шаблона, и без этой метки
   *  окно забыло бы, что выбирали по редкости. На сервер не уходит. */
  rarity?: string | null;
};
export type BandDraft = { places: string; prizes: PrizeDraft[] };
export type TourDraft = {
  id: string | null;
  name: string;
  metric: TourMetric;
  days: string;
  /** Начало и конец — значения полей datetime-local, по UTC; "" — не задано. */
  startAt: string;
  endAt: string;
  /** Начало, уже сохранённое у черновика (поле как с сервера): его можно
   *  оставить и в прошлом — автостарт не прошёл, админ правит призы. */
  savedStartAt?: string;
  bands: BandDraft[];
  /** Цена записи строками редактора цен; пусто — бесплатно. */
  entryPrice: TourEntryPrice[];
  items?: string[]; // «Зелья скорости»: id зелий; [] — все со скоростью, нет — «Дурман»
};

/**
 * Вид приза в меню админки. DARAI — тоже токен (владелец, 04.10): он первым в
 * списке токенов, отдельной кнопки нет. «Артефакт по редкости» — art с refId
 * 'rarity:<…>', конкретный артефакт выбирается на финише.
 */
export type PrizeUiKind = "darai" | "art_rarity" | TourPrizeKind;
/** Что предлагает меню. «Предмет» (item) не предлагается: в инвентаре живут
 *  только артефакты и герои, у них свои кнопки; пришедший с сервера item
 *  меню всё равно покажет. */
// «Билеты» не предлагаются: билетов нет (§8.61), старый приз tickets выдаётся золотом ×100.
export const PRIZE_UI_KINDS: readonly PrizeUiKind[] = [
  "token",
  "resource",
  "custom",
  "pack",
  "art",
  "art_rarity",
  "hero",
  "energy",
  "likes",
];

/** Штучные виды: пол-бокса и треть лайка не выдают. */
const PIECE: ReadonlySet<TourPrizeKind> = new Set([
  "pack",
  "art",
  "hero",
  "item",
  "likes",
  "tickets",
]);
/** Виды, которым нужна ссылка: символ токена, код ресурса, id бокса/шаблона. */
const NEEDS_REF: ReadonlySet<TourPrizeKind> = new Set([
  "token",
  "resource",
  "pack",
  "art",
  "hero",
  "item",
  "custom",
]);
/** Подпись и картинку несут виды с выбором из справочника. */
const HAS_TITLE: ReadonlySet<TourPrizeKind> = new Set(["pack", "art", "hero", "item", "custom"]);

export const isPieceKind = (k: TourPrizeKind): boolean => PIECE.has(k);

export const uiKindOf = (p: Pick<PrizeDraft, "kind" | "refId" | "rarity">): PrizeUiKind =>
  p.kind === "art" && (String(p.refId ?? "").startsWith("rarity:") || !!p.rarity)
    ? "art_rarity"
    : p.kind;

/**
 * Новый приз выбранного вида; сумма переезжает. Ресурс сразу «золото»: пустой
 * селект админ не замечал и уходил (урок фонда наград, RewardFundList).
 */
export function prizeOfUiKind(k: PrizeUiKind, amount = ""): PrizeDraft {
  const base = { amount, title: null, image: null };
  if (k === "darai" || k === "token") return { ...base, kind: "token", refId: TOUR_DARAI };
  if (k === "resource") return { ...base, kind: "resource", refId: "gold" };
  if (k === "art_rarity") {
    return {
      ...base,
      kind: "art",
      refId: "rarity:legendary",
      title: "Легендарный артефакт",
      rarity: "legendary",
    };
  }
  return { ...base, kind: k, refId: null };
}

export const emptyTourDraft = (): TourDraft => ({
  id: null,
  name: "",
  metric: "damage",
  days: String(TOUR_DEFAULT_DAYS),
  startAt: "",
  endAt: "",
  bands: [{ places: "1", prizes: [prizeOfUiKind("darai")] }],
  // 5 золота (владелец, 04.10). Копия: редактор правит строки, образец — общий.
  entryPrice: TOUR_DEFAULT_ENTRY_PRICE.map((p) => ({ ...p })),
});

export const draftOfRow = (row: TourAdminRow): TourDraft => ({
  id: row.id,
  name: row.name,
  metric: row.metric,
  days: String(row.days),
  startAt: utcInputOf(row.startAt),
  endAt: utcInputOf(row.endAt),
  savedStartAt: utcInputOf(row.startAt),
  bands: row.bands.map((b) => ({
    places: b.places,
    prizes: b.prizes.map((p) => ({
      kind: p.kind,
      amount: String(p.amount),
      refId: p.refId ?? null,
      title: p.title ?? null,
      image: p.image ?? null,
    })),
  })),
  entryPrice: row.entryPrice.map((p) => ({ ...p })),
  items: [...(row.items ?? [])],
});

/** Следующая строка — место сразу за самым дальним занятым. */
export function nextBandPlaces(bands: readonly BandDraft[]): string {
  const last = bands.reduce((m, b) => Math.max(m, parsePlaces(b.places)?.to ?? 0), 0);
  return String(last + 1);
}

/** Сумма из поля: запятая — как точка, у штучных — целое вниз, мусор — 0. */
export function amountOf(kind: TourPrizeKind, raw: string): number {
  const n = Number(
    String(raw ?? "")
      .trim()
      .replace(",", "."),
  );
  if (!Number.isFinite(n)) return 0;
  return PIECE.has(kind) ? Math.floor(n) : n;
}

/** Приз для сервера: поля чужих видов вычищены, чтобы не путать разбор. */
export function prizeOfDraft(p: PrizeDraft): TourPrize {
  const ref = NEEDS_REF.has(p.kind) ? (p.refId ?? "").trim() || null : null;
  const titled = HAS_TITLE.has(p.kind) && ref !== null;
  return {
    kind: p.kind,
    amount: amountOf(p.kind, p.amount),
    refId: ref,
    title: titled ? p.title : null,
    image: titled ? p.image : null,
  };
}

export const bandsOfDraft = (d: Pick<TourDraft, "bands">): TourBand[] =>
  d.bands.map((b) => ({ places: b.places.trim(), prizes: b.prizes.map(prizeOfDraft) }));

/** Дни из поля: целое 1..90, иначе null. */
export function daysOf(raw: string): number | null {
  const n = Number(String(raw ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= TOUR_MAX_DAYS ? n : null;
}

/** Первая ошибка формы ключом tour.err.* или null — можно сохранять.
 *  nowMs — проверить, что начало не в прошлом (форма передаёт Date.now());
 *  нетронутое сохранённое начало — не ошибка (как keepStartMs у сервера). */
export function draftError(d: TourDraft, nowMs?: number): string | null {
  if (!d.name.trim()) return "tour.err.name";
  const se = scheduleError(d.startAt, d.endAt, nowMs, d.id ? d.savedStartAt : undefined);
  if (se) return se;
  // Заданы начало и конец — дни считаются из них, поле «Дней» не участвует.
  if (spanDays(d.startAt, d.endAt) === null && daysOf(d.days) === null) return "tour.err.days";
  const priceErr = tourEntryPriceError(d.entryPrice);
  if (priceErr) return priceErr;
  // Турнир без призовых строк сервер не сохраняет — тем же ключом.
  if (d.bands.length === 0) return "tour.err.no_prize";
  const bands = bandsOfDraft(d);
  const err = bandsError(bands);
  if (err) return err;
  // Тот же разбор приза, что у сервера (prizeError): токен/ресурс/бокс без
  // выбора, дробные штуки — отказ одним ключом с сохранением.
  for (const b of bands) {
    for (const p of b.prizes) {
      const pe = prizeError(p);
      if (pe) return pe;
    }
  }
  return null;
}

export type TourSavePayload = {
  id?: string;
  name: string;
  metric: TourMetric;
  days: number;
  /** ISO UTC; null — без автостарта (старт кнопкой) / конец через days. */
  startAt: string | null;
  endAt: string | null;
  bands: TourBand[];
  entryPrice: TourEntryPrice[];
  items: string[];
};

/** Тело adminTourSave. Звать после draftError === null. */
export function savePayload(d: TourDraft): TourSavePayload {
  return {
    ...(d.id ? { id: d.id } : {}),
    name: d.name.trim(),
    metric: d.metric,
    days: spanDays(d.startAt, d.endAt) ?? daysOf(d.days) ?? TOUR_DEFAULT_DAYS,
    startAt: isoOfUtcInput(d.startAt) ?? null,
    endAt: isoOfUtcInput(d.endAt) ?? null,
    bands: bandsOfDraft(d),
    entryPrice: cleanEntryPrice(d.entryPrice),
    items: d.metric === "potion_drink" ? [...(d.items ?? [])] : [],
  };
}
