/** MCT belongs to the separate wallet service, not castle resources. */
export function isCastleToken(symbol: string) {
  return !["MCT", "MST", "МСТ"].includes(symbol.trim().toUpperCase());
}
