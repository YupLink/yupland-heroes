// Сдача лишних тренировочных фишек за энергию (владелец, 06.11.2026): курс — 5 энергии за
// звезду фишки; сдаются всегда самые слабые, 10 сильнейших остаются на аккаунте в любом
// случае; только тренировочные фишки. Сдать можно в лавке острова новичка.

export const TRAINING_KEEP = 10;
export const ENERGY_PER_STAR = 5;

export type TrainingChip = { id: string; star: number; obtainedAt?: string | null };

/** Порядок «сильнейшие первыми» — тот же, что у сервера (star ↓, старше ↑, id ↑). */
const strongFirst = (a: TrainingChip, b: TrainingChip) =>
  b.star - a.star ||
  (a.obtainedAt ?? "").localeCompare(b.obtainedAt ?? "") ||
  a.id.localeCompare(b.id);

/** Сколько и какие сдать: `count` слабейших из всего, что сверх 10 сильнейших. */
export function trainingSalePlan(chips: readonly TrainingChip[], count: number) {
  const rest = [...chips].sort(strongFirst).slice(TRAINING_KEEP).reverse();
  const take = rest.slice(0, Math.max(0, Math.min(Math.floor(count), rest.length)));
  let sum = 0;
  /** steps[k-1] — сколько энергии даст сдача k слабейших (для подписи кнопки). */
  const steps = rest.map((c) => (sum += ENERGY_PER_STAR * Math.max(0, c.star)));
  return {
    ids: take.map((c) => c.id),
    energy: take.length ? steps[take.length - 1] : 0,
    sellable: rest.length,
    steps,
  };
}
