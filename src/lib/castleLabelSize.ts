export const LABEL_SIZE_MIN = 10;
export const LABEL_SIZE_MAX = 20;
export const LABEL_SIZE_DEFAULT = 14;

export function castleLabelSize(size?: number | null): number {
  if (size == null || !Number.isFinite(size)) return LABEL_SIZE_DEFAULT;
  return Math.min(LABEL_SIZE_MAX, Math.max(LABEL_SIZE_MIN, Math.round(size)));
}
