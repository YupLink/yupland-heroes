// Символы и таблица выплат — 1-в-1 как в Fairy Land (Igrosoft), меняется
// только картинка. Коэффициенты к ставке на линию за 3 / 4 / 5 подряд.
// Оригинал → наш визуал (9 картинок владельца): BAR/2BAR/3BAR → шишки;
// улитка → мешок желудей; бабочка → герой в проруби; 7 → огурец «Nice win»;
// логотип → корона «Big win»; хамелеон (Wild) → золотая рыба; лягушонок
// (Бонус) → герой с лопатой.
import type { SymbolId } from "./types";

export type SlotSymbol = {
  id: SymbolId;
  img: string;
  /** Выплаты за 3, 4, 5 в ряд. Null — символ не платит по линии. */
  pays: [number, number, number] | null;
  wild?: boolean;
  bonus?: boolean;
  /** Wild этот символ НЕ заменяет (логотип в оригинале). */
  noWild?: boolean;
};

export const SYMBOLS: SlotSymbol[] = [
  { id: "bar1", img: "/slot/bar1.webp", pays: [2, 5, 20] },
  { id: "bar2", img: "/slot/bar2.webp", pays: [5, 10, 50] },
  { id: "bar3", img: "/slot/bar3.webp", pays: [10, 50, 75] },
  { id: "snail", img: "/slot/snail.webp", pays: [10, 50, 100] },
  { id: "butterfly", img: "/slot/butterfly.webp", pays: [20, 50, 150] },
  { id: "seven", img: "/slot/seven.webp", pays: [20, 100, 250] },
  { id: "logo", img: "/slot/logo.webp", pays: [100, 1000, 10000], noWild: true },
  { id: "wild", img: "/slot/wild.webp", pays: [100, 250, 2500], wild: true },
  { id: "bonus", img: "/slot/bonus.webp", pays: null, bonus: true },
];

const BY_ID: Record<SymbolId, SlotSymbol> = Object.fromEntries(
  SYMBOLS.map((s) => [s.id, s]),
) as Record<SymbolId, SlotSymbol>;

export function symbolOf(id: SymbolId): SlotSymbol {
  return BY_ID[id];
}

/** Коэффициент за `count` символов `id` в ряд (0, если не платит). */
export function payFor(id: SymbolId, count: number): number {
  const s = BY_ID[id];
  if (!s.pays || count < 3) return 0;
  return s.pays[Math.min(count, 5) - 3];
}

export const WILD: SymbolId = "wild";
export const BONUS: SymbolId = "bonus";
/** Сколько «Бонус» на экране открывают бонусную игру. */
export const BONUS_MIN = 3;
