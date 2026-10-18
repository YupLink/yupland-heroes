// numeric Postgres на BigInt — для фейков базы в тестах.
//
// Рюкзак и полки склада хранят numeric с восемнадцатью знаками (дроби наград),
// а до клиента число доезжает double. Разница живёт в 16-м знаке, и тест на
// double её бы не увидел: считаем точной десятичной арифметикой, как база.
const SCALE = 30n;
const unit = (k: bigint) => 10n ** k;

/** Число или строка (в том числе «1e-7», как его пишет JS) → numeric. */
export function dec(v: string | number): bigint {
  const s = String(v).trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(s);
  if (!m) throw new Error(`не число: ${s}`);
  const [, sign, int, frac = "", exp = "0"] = m;
  const shift = SCALE - BigInt(frac.length) + BigInt(exp);
  const digits = BigInt(int + frac);
  const abs = shift >= 0n ? digits * unit(shift) : digits / unit(-shift);
  return sign ? -abs : abs;
}

/** ROUND(v, k): половинки — от нуля, как у numeric. */
export function roundDec(v: bigint, k: number): bigint {
  const u = unit(SCALE - BigInt(k));
  const q = v / u;
  const r = v % u;
  const adj = r * 2n >= u ? 1n : r * 2n <= -u ? -1n : 0n;
  return (q + adj) * u;
}

/** numeric → десятичная строка без хвоста нулей (как отдаёт база). */
export function decStr(v: bigint): string {
  const abs = v < 0n ? -v : v;
  const frac = (abs % unit(SCALE)).toString().padStart(Number(SCALE), "0").replace(/0+$/, "");
  return `${v < 0n ? "-" : ""}${abs / unit(SCALE)}${frac ? `.${frac}` : ""}`;
}

/** numeric → number, как после row_to_json и JSON.parse. */
export const decNum = (v: bigint): number => Number(decStr(v));
