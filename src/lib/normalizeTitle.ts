// Канонизация title'а NFT для сравнения.
// Mintbase отдаёт один и тот же title в разных регистрах и с разными
// пробелами ("Old motor (update +4)" vs "old motor (update +4)" vs
// "Old Motor (Update +4)"). Для логики (дропы, ticket events, scan) это
// один и тот же предмет. Для UI показываем оригинал.
export function normalizeTitle(s: string | null | undefined): string {
  if (!s) return "";
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

// true если два title'а — это «логически один» NFT-предмет.
export function sameTitle(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  return normalizeTitle(a) === normalizeTitle(b);
}
