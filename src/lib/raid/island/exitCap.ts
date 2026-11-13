// Сколько ресурсов выносит игрок с острова новичка (владелец, 06.11.2026: «чтобы
// боты не обогащались… на острове можно проводить сколько угодно времени, но за
// проход у пользователя от всего, что он намайнил, получилось не больше — 50
// дерева, 20 камня, золото до сотни, парочку алмазов»). Считается прибавка за
// остров: сколько стало при выходе порталом минус сколько было при создании
// острова. Сверх потолка — остаётся на острове (списывается журналом ресурсов).

export const ISLAND_EXIT_CAP = { wood: 50, stone: 20, gold: 100, diamonds: 2 } as const;

/**
 * Потолок накопления на самом острове (владелец, 06.11.2026: «больше которого ресурсы просто
 * не накапливаются… ни продажи, никакие другие механики»): пока герой на своём острове, ресурс
 * аккаунта не растёт выше. Держит база (res_move, миграция island-14) — числа те же.
 */
export const ISLAND_HOLD_CAP = { wood: 15_000, stone: 5_000, gold: 2_000, diamonds: 10 } as const;

export type ExitRes = keyof typeof ISLAND_EXIT_CAP;
export const EXIT_RES = Object.keys(ISLAND_EXIT_CAP) as ExitRes[];

export type ResAmounts = Partial<Record<ExitRes, number>>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Сколько срезать на выходе: прибавка сверх потолка, по 4 знака (точность журнала). */
export function islandExitCut(base: ResAmounts, now: ResAmounts): ResAmounts {
  const out: ResAmounts = {};
  for (const r of EXIT_RES) {
    const over = num(now[r]) - num(base[r]) - ISLAND_EXIT_CAP[r];
    const cut = Math.floor(Math.max(0, over) * 1e4) / 1e4;
    if (cut > 0) out[r] = cut;
  }
  return out;
}
