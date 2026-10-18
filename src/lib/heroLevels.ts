// Уровни героев: стоимость повышения в лайках и потолки по редкости.
// Спека Гермеса (09.08) + уточнение владельца 20.08:
//   пропущенные в исходнике ступени 8→9 = 320 и 18→19 = 1600.
//
// Индекс массива = уровень, С которого повышаемся: LEVEL_COST[0] — цена
// перехода 0→1. Всего 60 ступеней: 0→1 … 59→60.
//
// Повышенные уровни (владелец, 02.10.2026): рар 21–30, эпик 31–40, лег 41–60.
// Лестница цен одна на всех — рар идёт 20→30 по тем же ступеням, что эпик,
// эпик 30→40 — что лег; лег 40→60 — ступени Гермеса (60 000 … 400 000).
// На повышенных уровнях «обычные повышения не работают»: прибавки расы и
// спеки (и торговля Торговца) стоят на обычном потолке, вместо них — очки
// навыков, которые игрок распределяет сам (src/lib/hero/heroSkills.ts).

export const LEVEL_COST: number[] = [
  50,    // 0→1
  70,    // 1→2
  90,    // 2→3
  120,   // 3→4
  150,   // 4→5
  200,   // 5→6
  250,   // 6→7
  300,   // 7→8
  320,   // 8→9   (уточнено владельцем)
  350,   // 9→10
  400,   // 10→11
  500,   // 11→12
  600,   // 12→13
  700,   // 13→14
  900,   // 14→15
  1100,  // 15→16
  1300,  // 16→17
  1500,  // 17→18
  1600,  // 18→19  (уточнено владельцем)
  1700,  // 19→20  ← потолок RARE
  2000,  // 20→21
  2500,  // 21→22
  3000,  // 22→23
  3500,  // 23→24
  4000,  // 24→25
  5000,  // 25→26
  6000,  // 26→27
  7000,  // 27→28
  8000,  // 28→29
  9000,  // 29→30  ← потолок EPIC
  10000, // 30→31
  12000, // 31→32
  14000, // 32→33
  16000, // 33→34
  18000, // 34→35
  20000, // 35→36
  25000, // 36→37
  30000, // 37→38
  35000, // 38→39
  50000, // 39→40  ← обычный потолок LEGENDARY, повышенный EPIC
  60000, // 40→41  — повышенные уровни лега (Гермес, 02.10.2026)
  70000, // 41→42
  80000, // 42→43
  90000, // 43→44
  100000, // 44→45
  120000, // 45→46
  140000, // 46→47
  160000, // 47→48
  180000, // 48→49
  200000, // 49→50
  220000, // 50→51
  240000, // 51→52
  260000, // 52→53
  280000, // 53→54
  300000, // 54→55
  320000, // 55→56
  340000, // 56→57
  360000, // 57→58
  380000, // 58→59
  400000, // 59→60  ← потолок LEGENDARY
];

export type HeroRarity = "common" | "rare" | "epic" | "legendary";

// Потолки привязаны к массиву LEVEL_COST: common — 10 (до цены 350),
// rare — 30 (до 9000), epic — 40 (до 50000), legendary — все 60 (до 400000);
// обычные потолки (до повышенных) — 10/20/30/40.
// Чем выше редкость, тем больше ступеней доступно и тем дороже финальные апы.
//
// Common — «обычный герой»: стартовый на выбор расы, из фишек НЕ делается,
// 10 уровней, 1 слот книги, 1 ячейка рюкзака, 4 места артефактов
// (голова/тело/правая рука/ноги — см. heroSlots.ts).
/** Обычный потолок: до него каждый уровень даёт прибавки расы и спеки. */
export const BASE_LEVEL_BY_RARITY: Record<HeroRarity, number> = {
  common: 10,
  rare: 20,
  epic: 30,
  legendary: 40,
};

/** Максимальный уровень по редкости — с повышенными (common их не имеет). */
export const MAX_LEVEL_BY_RARITY: Record<HeroRarity, number> = {
  common: 10,
  rare: 30,
  epic: 40,
  legendary: 60,
};

const rarityOf = (r: string | null | undefined): HeroRarity =>
  r === "common" || r === "epic" || r === "legendary" ? r : "rare";

/**
 * Уровень, от которого считаются прибавки расы и спеки: выше обычного
 * потолка не растёт — «обычные повышения не работают» на повышенных уровнях.
 */
export function growthLevel(rarity: string | null | undefined, level: number): number {
  const l = Math.max(0, Math.floor(Number(level) || 0));
  return Math.min(l, BASE_LEVEL_BY_RARITY[rarityOf(rarity)]);
}

/** Повышенный ли это уровень (выше обычного потолка редкости). */
export function isBoostedLevel(rarity: string | null | undefined, level: number): boolean {
  return Math.floor(Number(level) || 0) > BASE_LEVEL_BY_RARITY[rarityOf(rarity)];
}

/**
 * Очки навыков, заработанные к уровню: только на повышенных уровнях — +1 за
 * каждый, ещё +2 за каждый пятый и ещё +3 за каждый десятый. Рар на 30-м — 17,
 * эпик на 40-м — 17, лег на 60-м — 34.
 */
export function skillPointsAt(rarity: string | null | undefined, level: number): number {
  const base = BASE_LEVEL_BY_RARITY[rarityOf(rarity)];
  const max = MAX_LEVEL_BY_RARITY[rarityOf(rarity)];
  const l = Math.min(Math.max(0, Math.floor(Number(level) || 0)), max);
  if (l <= base) return 0;
  const fives = Math.floor(l / 5) - Math.floor(base / 5);
  const tens = Math.floor(l / 10) - Math.floor(base / 10);
  return l - base + 2 * fives + 3 * tens;
}

/** Цена следующего уровня. null — уже потолок для этой редкости. */
export function nextLevelCost(rarity: HeroRarity, level: number): number | null {
  const max = MAX_LEVEL_BY_RARITY[rarity];
  if (level >= max) return null;
  return LEVEL_COST[level] ?? null;
}

/** Сколько лайков суммарно нужно, чтобы дойти с fromLevel до toLevel. */
export function totalCost(fromLevel: number, toLevel: number): number {
  let sum = 0;
  for (let l = Math.max(0, fromLevel); l < toLevel; l++) sum += LEVEL_COST[l] ?? 0;
  return sum;
}

// ─── Конвертация фишки в героя ───
// Уровень (звёзды) фишки → редкость героя и цена в лайках.
// Спека владельца 20.08: 3 и 3.5★ = 50 (rare), 4 и 4.5★ = 1000 (epic), 5★ = 5000 (leg).

export type ConvertRule = { rarity: HeroRarity; likes: number };

export function convertRuleForChipLevel(level: number): ConvertRule | null {
  if (level >= 5) return { rarity: "legendary", likes: 5000 };
  if (level >= 4) return { rarity: "epic", likes: 1000 };
  if (level >= 3) return { rarity: "rare", likes: 50 };
  return null; // ниже 3★ в героя не превращается
}
