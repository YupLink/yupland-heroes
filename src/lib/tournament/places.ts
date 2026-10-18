// Места и призы турнира: одно поле «Места» — «1» или «2-3» (правило проекта:
// диапазон — одно поле), разбор, проверка и фонд DARAI под бронь пула.
import { TOUR_DARAI, type TourBand, type TourPrize } from "@/lib/tournament/types";

/** Потолок призовых мест: дальше таблица есть, призов нет. */
export const TOUR_MAX_PLACE = 500;

export type PlaceRange = { from: number; to: number };

/** «1» → 1–1, «2-3» / «2–3» → 2–3. Мусор, ноль, перевёрнутый диапазон — null. */
export function parsePlaces(raw: string): PlaceRange | null {
  const m = String(raw ?? "")
    .trim()
    .match(/^(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/);
  if (!m) return null;
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  if (from < 1 || to < from || to > TOUR_MAX_PLACE) return null;
  return { from, to };
}

/** Ошибка строк призов ключом перевода (tour.err.*) или null — всё верно. */
export function bandsError(bands: readonly TourBand[]): string | null {
  const taken = new Set<number>();
  for (const b of bands) {
    const r = parsePlaces(b.places);
    if (!r) return "tour.err.places";
    if (!b.prizes.length) return "tour.err.no_prize";
    for (const p of b.prizes) if (!(Number(p.amount) > 0)) return "tour.err.amount";
    for (let i = r.from; i <= r.to; i++) {
      if (taken.has(i)) return "tour.err.overlap";
      taken.add(i);
    }
  }
  return null;
}

/** Призы одного места (по первой подходящей строке). */
export function prizesForPlace(bands: readonly TourBand[], place: number): TourPrize[] {
  for (const b of bands) {
    const r = parsePlaces(b.places);
    if (r && place >= r.from && place <= r.to) return b.prizes;
  }
  return [];
}

/** Сколько всего призовых мест. */
export const prizePlaces = (bands: readonly TourBand[]): number =>
  bands.reduce((s, b) => {
    const r = parsePlaces(b.places);
    return s + (r ? r.to - r.from + 1 : 0);
  }, 0);

const daraiOf = (prizes: readonly TourPrize[]): number =>
  prizes.reduce(
    (s, p) =>
      s + (p.kind === "token" && p.refId === TOUR_DARAI ? Math.max(0, Number(p.amount) || 0) : 0),
    0,
  );

/** DARAI на всех призовых местах — столько бронируется из пула при старте. */
export const fundDarai = (bands: readonly TourBand[]): number =>
  bands.reduce((s, b) => {
    const r = parsePlaces(b.places);
    return s + (r ? (r.to - r.from + 1) * daraiOf(b.prizes) : 0);
  }, 0);

/** DARAI одного места — его возвращают в пул, если место не занято или приз сгорел. */
export const placeDarai = (bands: readonly TourBand[], place: number): number =>
  daraiOf(prizesForPlace(bands, place));
