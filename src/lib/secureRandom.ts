// Криптослучайное целое в [min, max) через Web Crypto — есть и в Node, и в
// браузере, поэтому модуль не тянет node:crypto в клиентскую сборку (файлы
// серверных функций грузятся и клиентом). Равномерно: лишний хвост отбрасываем.
// Диапазон — до 2^53 (ролл бокса: 50 призов × 100 % × 1e6 > 2^32).
const TWO53 = 2 ** 53;

function random53(): number {
  const buf = new Uint32Array(2);
  globalThis.crypto.getRandomValues(buf);
  // 27 + 26 бит, как в Math.random-подобных генераторах.
  return (buf[0] >>> 5) * 67108864 + (buf[1] >>> 6);
}

export function secureRandomInt(min: number, max: number): number {
  const lo = Math.floor(min);
  const range = Math.floor(max) - lo;
  if (!(range > 0)) return lo;
  if (range > TWO53) throw new Error("secureRandomInt: слишком широкий диапазон");
  const limit = TWO53 - (TWO53 % range);
  for (;;) {
    const r = random53();
    if (r < limit) return lo + (r % range);
  }
}

/** Криптослучайная дробь в [0, 1) — замена Math.random() один в один (53 бита). */
export function secureRandom(): number {
  return random53() / TWO53;
}
