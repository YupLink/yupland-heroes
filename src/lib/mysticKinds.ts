// Виды призов мистического бокса — общие для сервера (схема, выдача) и
// админки/окна открытия. Владелец, 29.09: из бокса может выпасть ЛЮБОЙ
// внутриигровой ресурс — предметы, свои товары (зелья, инструменты, сундуки),
// ресурсы, лайки, билеты, энергия, токены на счёт, паки и другие боксы.

export const MYSTIC_KINDS = [
  "pack",
  "tickets",
  "energy",
  "likes",
  "resource",
  "custom",
  "token",
  "artifact",
  "hero",
  // Старые виды: в пулах могут лежать, выпадают «пусто» (выдачи нет).
  "nft",
  "ft",
] as const;
export type MysticKind = (typeof MYSTIC_KINDS)[number];

/** Что показывать в конструкторе (nft/ft — старые заглушки, не предлагаем). */
export const MYSTIC_EDITOR_KINDS: MysticKind[] = [
  "pack",
  "artifact",
  "hero",
  "custom",
  "resource",
  "token",
  "tickets",
  "energy",
  "likes",
];

/** Виды с количеством «от-до». */
export const AMOUNT_KINDS: MysticKind[] = ["tickets", "energy", "likes", "resource", "custom", "token", "ft"];

/** Токены единого счёта, которые может дать бокс. USDT — нет (ПРАВИЛА §8.49а):
 *  бокс выдаёт без предела, а USDT — живые деньги. */
export const MYSTIC_TOKENS = ["Darai", "STARS"] as const;
export type MysticToken = (typeof MYSTIC_TOKENS)[number];
/** Старые пулы могли хранить USDT: разбор их принимает, сохранить — нельзя. */
export const MYSTIC_LEGACY_TOKENS: readonly string[] = [...MYSTIC_TOKENS, "USDT"];

/** Дробные количества — только у токенов; остальное штучно. */
export const isFractionalKind = (k: MysticKind) => k === "token" || k === "ft";

/**
 * «10-30», «5 – 20», «7», «0.5-2» → {min, max}. Одно число — ровно столько.
 * Мусор — null.
 */
export function parseAmountRange(raw: string, fractional = false): { min: number; max: number } | null {
  const nums = raw.replace(",", ".").match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const fix = (n: number) => (fractional ? Math.round(n * 1e6) / 1e6 : Math.round(n));
  const a = fix(Number(nums[0]));
  const b = nums[1] === undefined ? a : fix(Number(nums[1]));
  if (!(Number.isFinite(a) && Number.isFinite(b))) return null;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

/** Обратно в поле: 10..30 → «10-30», 7..7 → «7». */
export function amountRangeText(min?: number, max?: number): string {
  if (min == null && max == null) return "";
  const a = min ?? max ?? 0;
  const b = max ?? a;
  return a === b ? String(a) : `${a}-${b}`;
}
