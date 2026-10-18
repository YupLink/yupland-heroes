export function parseRewardSpec(input: string): { min: number; max: number } | null {
  const s = input.trim();
  if (!s) return null;
  const range = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
    return { min, max };
  }
  const fixed = s.match(/^(\d+)$/);
  if (fixed) {
    const n = Number(fixed[1]);
    if (!Number.isFinite(n) || n < 0) return null;
    return { min: n, max: n };
  }
  return null;
}

export function formatRewardSpec(min: number, max: number): string {
  return min === max ? String(min) : `${min}-${max}`;
}

/** Потолок паков за клейм — тот же, что в серверной схеме (src/server/random.ts). */
export const MAX_PACK_QTY = 100;

/** Поле ввода → целое 1..MAX_PACK_QTY. Пусто/мусор → 1. */
export function parsePackQty(input: string | number | undefined | null): number {
  const n = typeof input === "number" ? input : Number(String(input ?? "").trim());
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_PACK_QTY, Math.max(1, Math.floor(n)));
}
