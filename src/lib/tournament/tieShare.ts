// Ничья на финише (владелец, 06.10.2026: «при равном счёте призы делятся
// поровну»). n игроков с одинаковым итоговым счётом занимают места k..k+n−1 и
// все стоят на месте k. Делимые призы этих мест (токены и DARAI, ресурсы,
// энергия, лайки, билеты) складываются и делятся поровну. Неделимые (артефакт,
// пак, герой, предмет, свой товар) поделить нельзя — каждый в группе получает
// неделимые призы лучшего места группы, k.
//
// DARAI, ресурсы, лайки и билеты делятся целыми, вниз; энергия и прочие
// токены — до миллионных. Остаток DARAI возвращается в пул карты вместе с
// DARAI незанятых мест (tour-finish), поэтому бронь при старте не меняется.
import { prizesForPlace } from "@/lib/tournament/places";
import {
  TOUR_DARAI,
  type TourBand,
  type TourPrize,
  type TourPrizeKind,
} from "@/lib/tournament/types";

/** Виды, которые делятся: у них есть количество, а не штука. */
const DIVISIBLE = new Set<TourPrizeKind>(["token", "resource", "energy", "likes", "tickets"]);

const isDarai = (p: TourPrize): boolean => p.kind === "token" && p.refId === TOUR_DARAI;

/** Целым делятся DARAI, ресурсы, лайки и билеты. */
const wholeOnly = (p: TourPrize): boolean =>
  p.kind === "resource" || p.kind === "likes" || p.kind === "tickets" || isDarai(p);

/** Один делимый приз — вид и на что ссылается: «500 DARAI» места 2 и места 3 — один. */
const keyOf = (p: TourPrize): string => `${p.kind}:${p.refId ?? ""}`;

const round8 = (v: number): number => Math.round(v * 1e8) / 1e8;

/**
 * Доля одного из n: вниз до целого или до миллионных. Крошечный запас
 * гасит шум дробей (0,3 / 3 = 0,0999…).
 */
export function shareOf(total: number, n: number, whole: boolean): number {
  const step = whole ? 1 : 1e6;
  const size = Math.max(1, Math.floor(n));
  return Math.floor((Math.max(0, total) / size) * step + 1e-6) / step;
}

export type TieShare = {
  /** Призы каждого из группы — у всех одинаковые. */
  prizes: TourPrize[];
  /** DARAI, который не поделился нацело, — назад в пул. */
  leftDarai: number;
};

/**
 * Призы каждого из n равных на местах k..k+n−1. Один на месте — призы места
 * как есть: ключи подарков и суммы те же, что до правила ничьих. Порядок:
 * призы места k (делимые — уже долей), за ними делимые, которых у места k нет,
 * — по первому появлению. Нулевая доля в список не попадает.
 */
export function tieShare(bands: readonly TourBand[], k: number, n: number): TieShare {
  const size = Math.max(1, Math.floor(n));
  const own = prizesForPlace(bands, k);
  if (size === 1) return { prizes: own, leftDarai: 0 };

  const sums = new Map<string, { p: TourPrize; total: number }>();
  for (let place = k; place < k + size; place++) {
    for (const p of prizesForPlace(bands, place)) {
      if (!DIVISIBLE.has(p.kind)) continue;
      const amount = Math.max(0, Number(p.amount) || 0);
      const cur = sums.get(keyOf(p));
      if (cur) cur.total += amount;
      else sums.set(keyOf(p), { p, total: amount });
    }
  }

  const prizes: TourPrize[] = [];
  const shared = new Set<string>();
  let left = 0;
  const pushShare = (key: string): void => {
    const s = sums.get(key);
    if (!s || shared.has(key)) return;
    shared.add(key);
    const amount = shareOf(s.total, size, wholeOnly(s.p));
    if (isDarai(s.p)) left += s.total - amount * size;
    if (amount > 0) prizes.push({ ...s.p, amount });
  };
  for (const p of own) {
    if (DIVISIBLE.has(p.kind)) pushShare(keyOf(p));
    else prizes.push(p);
  }
  for (const key of sums.keys()) pushShare(key);
  return { prizes, leftDarai: round8(left) };
}

/** Группа равных: место k и все, кто на нём стоит. */
export type TieGroup = { place: number; accounts: string[] };

/**
 * Строки мест → группы по месту. Аккаунты внутри группы — по алфавиту:
 * порядок не влияет на призы, только на порядок подарков.
 */
export function groupByPlace(
  rows: ReadonlyArray<{ place: number | string; account_id: string }>,
): TieGroup[] {
  const by = new Map<number, string[]>();
  for (const r of rows) {
    const place = Number(r.place);
    if (!Number.isInteger(place) || place < 1 || !r.account_id) continue;
    const list = by.get(place) ?? [];
    if (!list.includes(r.account_id)) list.push(r.account_id);
    by.set(place, list);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([place, accounts]) => ({ place, accounts: [...accounts].sort() }));
}
