/** Rebuild a contiguous gesture range from the selection before the gesture. */
export function marketRange(base: string[], order: string[], anchor: string, target: string, adding: boolean, limit = Infinity): string[] {
  const start = order.indexOf(anchor), end = order.indexOf(target);
  if (start < 0 || end < 0) return base;
  const range = order.slice(Math.min(start, end), Math.max(start, end) + 1);
  if (!adding) {
    const drop = new Set(range);
    return base.filter(id => !drop.has(id));
  }
  const result = [...base];
  const have = new Set(base);
  for (const id of range) if (!have.has(id) && result.length < limit) { result.push(id); have.add(id); }
  return result;
}
