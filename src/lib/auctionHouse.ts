// Аукционный дом в замке (владелец, 13–14.10.2026). Общие правила для сервера и
// экрана; SQL (game-auction/house-fn.ts) повторяет слоты и комиссию — менять
// вместе.
//  · 10 уровней, строится и улучшается в Ратуше замка ресурсами; золото на
//    последних уровнях — самое дорогое. Каждый уровень меняет облик здания.
//  · Лотов разом — по уровню: 1-й — 1 … 10-й — 10. Слот занят, пока лот открыт, и
//    ровно сутки после продажи; не продан или снят — свободен сразу.
//  · Комиссия проекту плавно падает: 1-й уровень — 50 %, 10-й — 10 %.
//    Ставка лота фиксируется при выставлении. Комиссия с DARAI/USDT/звёзд —
//    как оплата подписки; с прочих валют просто не выплачивается.
//  · Валюты продажи открываются уровнями (см. CURRENCY_LEVEL); игроку без
//    кошелька (вход только через Telegram) с 5-го уровня — ещё и звёзды.
//  · Выставить можно свои ресурсы, артефакты (не надетые) и товары из рюкзака
//    выбранного героя. Паки — нельзя. На свой лот ставить нельзя.

export const HOUSE_MAX_LEVEL = 10;
export const HOUSE_MAX_SLOTS = 10;
export const SOLD_SLOT_HOURS = 24;

export type HouseCost = { wood: number; stone: number; gold: number; diamonds: number };

/** Цена шага N → N+1 (индекс — текущий уровень; 0 — постройка). */
const COSTS: HouseCost[] = [
  { wood: 3_000, stone: 800, gold: 5_000, diamonds: 30 },
  { wood: 5_000, stone: 1_300, gold: 15_000, diamonds: 50 },
  { wood: 8_000, stone: 2_000, gold: 40_000, diamonds: 80 },
  { wood: 12_000, stone: 3_000, gold: 100_000, diamonds: 120 },
  { wood: 18_000, stone: 4_500, gold: 200_000, diamonds: 170 },
  { wood: 26_000, stone: 6_500, gold: 400_000, diamonds: 240 },
  { wood: 36_000, stone: 9_000, gold: 800_000, diamonds: 330 },
  { wood: 50_000, stone: 12_500, gold: 1_500_000, diamonds: 450 },
  { wood: 70_000, stone: 17_000, gold: 3_000_000, diamonds: 600 },
  { wood: 100_000, stone: 25_000, gold: 6_000_000, diamonds: 800 },
];

/** Комиссия проекту с продажи, % (индекс — уровень − 1). */
export const FEE_BY_LEVEL = [50, 45, 40, 35, 30, 26, 22, 18, 14, 10] as const;

/** Сколько стоит следующий уровень; null — уже потолок. */
export function houseCost(level: number): HouseCost | null {
  return COSTS[Math.max(0, Math.floor(level))] ?? null;
}

const lvl = (level: number): number => Math.min(HOUSE_MAX_LEVEL, Math.max(0, Math.floor(level)));

/** Сколько лотов дом держит разом. */
export const houseSlots = (level: number): number => Math.min(HOUSE_MAX_SLOTS, lvl(level));

/** Комиссия дома этого уровня, %. */
export const houseFeePct = (level: number): number => FEE_BY_LEVEL[Math.max(1, lvl(level)) - 1];

/** С какого уровня дома открывается валюта продажи (владелец, 14.10). */
export const CURRENCY_LEVEL: Record<string, number> = {
  "res:gold": 1,
  "res:diamonds": 2,
  "res:stone": 3,
  "res:wood": 4,
  HOPE: 5,
  Darai: 6,
  USDT: 10,
};
/** Звёзды — игроку без кошелька, с этого уровня. */
export const STARS_LEVEL = 5;

/** Валюты, за которые игрок с домом этого уровня может продавать. */
export function houseCurrencies(level: number, walletLinked: boolean): string[] {
  const l = lvl(level);
  const list = Object.entries(CURRENCY_LEVEL)
    .filter(([, need]) => l >= need)
    .map(([c]) => c);
  if (!walletLinked && l >= STARS_LEVEL) list.push("STARS");
  return list;
}

/** Что игрок может выставить. */
export const PLAYER_LOT_KINDS = ["resource", "artifact", "custom"] as const;
export type PlayerLotKind = (typeof PLAYER_LOT_KINDS)[number];

/** Длительность лота игрока (часы) — без недельной: слот не должен стоять неделю. */
export const PLAYER_DURATIONS = ["1h", "6h", "12h", "1d", "3d"] as const;
export type PlayerDuration = (typeof PLAYER_DURATIONS)[number];
