// Порядок клеток снимка — одним числом, общим для сервера и клиента.
//
// Всё, что хранится или передаётся ПО НОМЕРАМ клеток (биты тумана на
// устройстве, список разведанного битами с сервера), годится только для того
// же порядка клеток. Хэш колонок q/r (FNV-1a) и есть подпись порядка: не
// совпал — биты не читать, брать список ключами.
export function cellOrderHash(q: ArrayLike<number>, r: ArrayLike<number>, n: number): string {
  let h = 2166136261;
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (q[i] & 0xffff), 16777619);
    h = Math.imul(h ^ (r[i] & 0xffff), 16777619);
  }
  return (h >>> 0).toString(16);
}

/** Битовая маска по номерам клеток: n клеток → ⌈n/8⌉ байт. */
export function packBits(n: number, has: (i: number) => boolean): Uint8Array {
  const out = new Uint8Array((n + 7) >> 3);
  for (let i = 0; i < n; i++) if (has(i)) out[i >> 3] |= 1 << (i & 7);
  return out;
}

export function bitAt(bits: Uint8Array, i: number): boolean {
  return (bits[i >> 3] & (1 << (i & 7))) !== 0;
}
