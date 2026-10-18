// Сколько раз таверна меняет героя и как скоро вернёт право на смену.
//
// Тиры постройки: первый — стройка (трактира ещё нет), второй — таверна, третий
// — улучшенная. Право на смену считаем зарядами: сколько тир даёт и через
// сколько каждый потраченный возвращается.
//
// Заряд возвращается через свой срок с МОМЕНТА траты, а не «всем скопом в
// полночь»: на третьем тире можно сменить героя дважды подряд и ждать полсуток,
// а можно ходить в трактир раз в двенадцать часов и не копить.

const HOUR_MS = 3_600_000;
export const SWAP_DAY_MS = 24 * HOUR_MS;

/** Заряды тира и срок возврата одного заряда. */
export type SwapLimit = { charges: number; refillMs: number };

/**
 * Тир клетки (0 — стройка) → правила смены. null — таверна ещё не работает.
 * Суточная норма одна на все тиры: тир 2 даёт одну смену в сутки, тир 3 — две
 * по 12 часов. Появится четвёртый — три по восемь, править формулу не придётся.
 */
export function tavernSwapLimit(tier: number): SwapLimit | null {
  const charges = Math.floor(Number(tier));
  if (!Number.isFinite(charges) || charges < 1) return null;
  return { charges, refillMs: Math.round(SWAP_DAY_MS / charges) };
}

export type SwapState = {
  charges: number;
  left: number;
  /** Когда вернётся ближайший заряд, мс. null — все заряды на месте. */
  nextAt: number | null;
};

/** Состояние по временам прошлых смен (мс). Свежие — те, что моложе refill. */
export function swapState(nowMs: number, usedAtMs: number[], limit: SwapLimit): SwapState {
  const fresh = usedAtMs
    .filter((t) => Number.isFinite(t) && nowMs - t < limit.refillMs)
    .sort((a, b) => a - b);
  // Держим только последние charges: смены старше уже вернулись, а лишние
  // записи лога иначе заперли бы таверну на срок, которого никто не назначал.
  const blocking = fresh.slice(-limit.charges);
  const left = Math.max(0, limit.charges - blocking.length);
  return {
    charges: limit.charges,
    left,
    nextAt: blocking.length ? blocking[0] + limit.refillMs : null,
  };
}

/** Остаток ожидания в часах и минутах — язык подписи выбирает интерфейс. */
export function swapWaitParts(ms: number): { h: number; m: number } {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  return { h: Math.floor(total / 60), m: total % 60 };
}
