// «Единство: Тираж» — бонус к боевым статам фишки от ТИРАЖА ЕЁ КОЛЛЕКЦИИ
// (chip_collections.initial_supply — общее кол-во фишек, заданное изначально).
// Чем МЕНЬШЕ тираж коллекции (реже) — тем больше бонус у КАЖДОЙ её фишки.
// Премиум-коллекция даёт плоский бонус сверху. Проценты СУММИРУЮТСЯ.
//
// ВАЖНО: бонус зависит от тиража КОЛЛЕКЦИИ, а не от номера (серийника) фишки.
// Все фишки одной коллекции получают одинаковый тираж-бонус.
// Пороги абсолютные (как в ТЗ): тираж<2001 +200/+200, <5001 +100/+100, и т.д.

export type TirageTier = {
  /** тираж коллекции строго меньше этого числа → этот тир */
  below: number;
  label: string;
  hpPct: number;
  atkPct: number;
};

// Порядок важен: первый тир, куда tirage < below.
export const TIRAGE_TIERS: TirageTier[] = [
  { below: 2001, label: "Тираж ≤ 2 000", hpPct: 200, atkPct: 200 },
  { below: 5001, label: "Тираж ≤ 5 000", hpPct: 100, atkPct: 100 },
  { below: 10001, label: "Тираж ≤ 10 000", hpPct: 50, atkPct: 25 },
  { below: 20001, label: "Тираж ≤ 20 000", hpPct: 25, atkPct: 0 },
];

/** Плоский бонус за премиум-коллекцию (суммируется с тираж-бонусом). */
export const PREMIUM_BONUS = { hpPct: 100, atkPct: 100 };

/**
 * АЛГОРИТМ определения премиум-коллекции — единая правда для боя и анкеты.
 * Премиум = в названии коллекции есть «premium» (соглашение об именовании:
 * "Burn Pack (Premium)", "Dragon Master (Premium)"…), ЛИБО ручной флаг is_premium
 * (обратная совместимость). Так НОВЫЕ коллекции автоматически получают премиум по
 * имени — без ручного тумблера в моменте. Меняешь правило здесь — меняется везде.
 */
export function isPremiumCollection(
  name: string | null | undefined,
  flag?: boolean | null
): boolean {
  return !!flag || /premium/i.test(name ?? "");
}

export type TirageBonus = {
  /** тираж коллекции, по которому считался бонус */
  tirage: number | null;
  tierLabel: string | null;
  tirageHpPct: number;
  tirageAtkPct: number;
  premium: boolean;
  premiumHpPct: number;
  premiumAtkPct: number;
  /** суммарный +% (тираж + премиум) */
  hpPct: number;
  atkPct: number;
  /** множитель к базовым статам (1 + %/100) */
  hpMult: number;
  atkMult: number;
};

/** Рассчитать бонус «Единство» по ТИРАЖУ коллекции и признаку премиум. */
export function tirageBonus(tirage: number | null, premium = false): TirageBonus {
  const tier =
    tirage == null ? null : (TIRAGE_TIERS.find((t) => tirage < t.below) ?? null);
  const tirageHpPct = tier?.hpPct ?? 0;
  const tirageAtkPct = tier?.atkPct ?? 0;
  const premiumHpPct = premium ? PREMIUM_BONUS.hpPct : 0;
  const premiumAtkPct = premium ? PREMIUM_BONUS.atkPct : 0;
  const hpPct = tirageHpPct + premiumHpPct;
  const atkPct = tirageAtkPct + premiumAtkPct;
  return {
    tirage,
    tierLabel: tier?.label ?? null,
    tirageHpPct,
    tirageAtkPct,
    premium,
    premiumHpPct,
    premiumAtkPct,
    hpPct,
    atkPct,
    hpMult: 1 + hpPct / 100,
    atkMult: 1 + atkPct / 100,
  };
}

/** "+200%" / "—" для показа. */
export const pct = (n: number): string => (n > 0 ? `+${n}%` : "—");

/** Множитель для подписи: 3 → "3", 2.25 → "2.25", 2.5 → "2.5". */
export const fmtMult = (m: number): string =>
  Number.isInteger(m) ? String(m) : String(Math.round(m * 100) / 100);
