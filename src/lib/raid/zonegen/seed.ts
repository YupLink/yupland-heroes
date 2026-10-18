// Сид зоны: из фразы, а не из воздуха.
//
// Владелец, 22.09.2026: «сиды — более качественные нужно сделать». Голое
// Math.random-число админ не запоминает и повторить не может: «та самая зона»
// жила ровно до перезагрузки панели. Фраза сид и есть: «северный берег» всегда
// даёт одно и то же число, фразу видно в отчёте, её можно записать и вернуть.
// Число при этом остаётся числом — сиды из старых правок продолжают работать.
import { sha256 } from "@noble/hashes/sha2.js";
import { SEED_MAX } from "@/lib/raid/zonegen/recipe";

/** Сидов ровно столько: [0, SEED_MAX] — то, что переживает JSON и Int32 в БД. */
const SEED_SPACE = SEED_MAX + 1;

/** Байт хеша под сид: 4 = uint32, больше в Int32 всё равно не влезет. */
const SEED_BYTES = 4;

/** Только цифры (пробелы по краям срезаны) — это число, а не фраза. */
const NUMBER_RE = /^\d+$/;

/**
 * Фраза → сид. sha256, а не самодельная свёртка: у самоделок близкие строки
 * («берег 1» и «берег 2») дают близкие числа, а сид от сида обязан отличаться
 * целиком, иначе две «разные» зоны выйдут почти одинаковыми.
 */
export function seedFromText(text: string): number {
  const h = sha256(new TextEncoder().encode(text));
  let u = 0;
  for (let i = 0; i < SEED_BYTES; i++) u = u * 256 + h[i];
  // Остаток, а не зажим: иначе половина хешей схлопнулась бы в один SEED_MAX.
  return u % SEED_SPACE;
}

/**
 * Что админ написал в поле сида. Чистое число берём как есть (историю правок
 * не ломаем), всё остальное — фраза: её и запоминаем, чтобы показать рядом.
 * Пусто — ни сида, ни фразы: вызывающий сам решит, крутить ли newSeed().
 */
export function parseSeedInput(raw: string): { seed: number; text: string | null } {
  const t = raw.trim();
  if (t === "") return { seed: 0, text: null };
  if (NUMBER_RE.test(t)) {
    const n = Number(t);
    // За пределами безопасного целого Number уже врёт — такое «число» честнее
    // хешировать как фразу, чем превращать в мусор с дробной частью.
    if (Number.isSafeInteger(n)) return { seed: n % SEED_SPACE, text: null };
  }
  return { seed: seedFromText(t), text: t };
}

/** Как показать сид: фраза важнее числа, но число нужно для повтора руками. */
export function seedLabel(seed: number, text: string | null): string {
  return text === null ? String(seed) : `«${text}» · ${seed}`;
}
