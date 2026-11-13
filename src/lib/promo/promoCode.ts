// Текст промокода: как хранится, какой годится админу и как придумать свой.

/** Как у кодов на лайки: пробелы по краям прочь, верхний регистр. */
export const normalizePromoCode = (s: string): string =>
  String(s ?? "")
    .trim()
    .toUpperCase();

/** Код админа: буквы (кириллица тоже), цифры, дефис, подчёркивание; 3–32 знака. */
export const isValidPromoCode = (s: string): boolean => /^[\p{L}\p{N}_-]{3,32}$/u.test(s);

/** Без похожих друг на друга знаков: ни 0/O, ни 1/I/L — код диктуют голосом. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Наибольшее кратное длине алфавита в байте: выше — перебрасываем, без перекоса. */
const FAIR = 256 - (256 % ALPHABET.length);

const cryptoBytes = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Читаемый код «XXXX-XXXX»: 31⁸ ≈ 8,5·10¹¹ вариантов — подбор под гейтом не пройдёт. */
export function generatePromoCode(bytes: (n: number) => Uint8Array = cryptoBytes): string {
  let out = "";
  while (out.length < 8) {
    for (const b of bytes(16)) {
      if (b >= FAIR) continue;
      out += ALPHABET[b % ALPHABET.length];
      if (out.length === 8) break;
    }
  }
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}
