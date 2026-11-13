// Движение барабана как у механического автомата (владелец, 20.10.2026: «плавно,
// по очереди, чтобы было видно, что это барабан, а не бегающие картинки»).
//
// Положение барабана x — сколько рядов ленты проехало вниз с начала спина.
//  • Разгон: барабаны трогаются по очереди (STAGGER_MS), скорость растёт ровно.
//  • Бег: постоянная скорость, пока сервер не прислал итог — и дальше до своей
//    остановки (timing.ts).
//  • Обычная остановка: плавное торможение (кубическое), лента чуть проезжает
//    дальше (OVERSHOOT) и возвращается — «отскок».
//  • Ожидание бонуса: долгое замедление, медленный ход, потом торможение. Одинаково
//    и когда третий бонус выпадет, и когда нет: исход по виду не угадать.
// Конечное положение — целое число рядов, итог встаёт точно в окно.

/** Рядов в мс на полном ходу. */
export const SPEED = 0.022;
/** Разгон до полного хода. */
export const ACCEL_MS = 260;
/** Барабаны трогаются с этим шагом слева направо. */
export const STAGGER_MS = 70;
/** Обычное торможение. */
export const DECEL_MS = 460;
/** Ожидание: замедление до медленного хода, затем финальное торможение. */
export const SLOWDOWN_MS = 520;
export const SLOW_SPEED = 0.0065;
export const SLOW_DECEL_MS = 760;
/** Проезд за итог и возврат. */
export const OVERSHOOT = 0.2;
export const BOUNCE_MS = 170;

/** Свободный ход барабана reel через t мс от начала спина (рядов). */
export function freeRun(t: number, reel: number): number {
  const tau = t - reel * STAGGER_MS;
  if (tau <= 0) return 0;
  if (tau < ACCEL_MS) return (SPEED * tau * tau) / (2 * ACCEL_MS);
  return SPEED * (tau - ACCEL_MS / 2);
}

export type StopPlan = {
  reel: number;
  anticipate: boolean;
  /** Начало торможения (или замедления в ожидании), мс от начала спина. */
  brakeAt: number;
  /** Барабан доехал до итога (с проездом), мс от начала спина. */
  stopAt: number;
  /** Барабан встал окончательно (после отскока). */
  landedAt: number;
  /** Итоговое положение — целое число рядов. */
  end: number;
};

/** Длительность и путь «хвоста» после постоянного хода. */
function tail(anticipate: boolean, cruiseMs: number) {
  if (!anticipate) return { dur: DECEL_MS, dist: (SPEED * DECEL_MS) / 3 };
  const slow = ((SPEED + SLOW_SPEED) / 2) * SLOWDOWN_MS;
  const cruise = SLOW_SPEED * cruiseMs;
  const brake = (SLOW_SPEED * SLOW_DECEL_MS) / 3;
  return { dur: SLOWDOWN_MS + cruiseMs + SLOW_DECEL_MS, dist: slow + cruise + brake };
}

/**
 * План остановки: итог пришёл в момент now (мс от начала спина), барабан должен
 * встать через stopIn мс (timing.ts, от прихода итога), в ожидании — anticipate
 * (stopIn тогда уже включает ANTICIPATION_MS).
 */
export function planStop(
  reel: number,
  now: number,
  stopIn: number,
  anticipate: boolean,
  anticipationMs: number,
): StopPlan {
  const cruiseMs = anticipate
    ? Math.max(0, anticipationMs + DECEL_MS - SLOWDOWN_MS - SLOW_DECEL_MS)
    : 0;
  const t = tail(anticipate, cruiseMs);
  const minBrake = Math.max(now, reel * STAGGER_MS + ACCEL_MS);
  let brakeAt = Math.max(minBrake, now + stopIn - t.dur);
  const raw = freeRun(brakeAt, reel) + t.dist - OVERSHOOT;
  let end = Math.round(raw);
  // Подгоняем начало торможения, чтобы итог встал ровно на целый ряд.
  brakeAt += (end - raw) / SPEED;
  if (brakeAt < minBrake) {
    end = Math.ceil(freeRun(minBrake, reel) + t.dist - OVERSHOOT);
    brakeAt = minBrake + (end - (freeRun(minBrake, reel) + t.dist - OVERSHOOT)) / SPEED;
  }
  const stopAt = brakeAt + t.dur;
  return { reel, anticipate, brakeAt, stopAt, landedAt: stopAt + BOUNCE_MS, end };
}

/** Положение барабана в момент t (мс от начала спина) и стадия. */
export function positionAt(
  t: number,
  reel: number,
  plan: StopPlan | null,
): { x: number; stage: "run" | "brake" | "bounce" | "landed" } {
  if (!plan || t <= plan.brakeAt) return { x: freeRun(t, reel), stage: "run" };
  const x0 = freeRun(plan.brakeAt, reel);
  const peak = plan.end + OVERSHOOT;
  if (t >= plan.landedAt) return { x: plan.end, stage: "landed" };
  if (t >= plan.stopAt) {
    const u = (t - plan.stopAt) / BOUNCE_MS;
    return { x: peak - OVERSHOOT * (0.5 - 0.5 * Math.cos(Math.PI * u)), stage: "bounce" };
  }
  const dt = t - plan.brakeAt;
  if (!plan.anticipate) {
    const u = dt / DECEL_MS;
    return { x: x0 + (peak - x0) * (1 - (1 - u) ** 3), stage: "brake" };
  }
  const cruiseMs = plan.stopAt - plan.brakeAt - SLOWDOWN_MS - SLOW_DECEL_MS;
  if (dt < SLOWDOWN_MS) {
    const v = SPEED + ((SLOW_SPEED - SPEED) * dt) / SLOWDOWN_MS;
    return { x: x0 + ((SPEED + v) / 2) * dt, stage: "brake" };
  }
  const x1 = x0 + ((SPEED + SLOW_SPEED) / 2) * SLOWDOWN_MS;
  if (dt < SLOWDOWN_MS + cruiseMs)
    return { x: x1 + SLOW_SPEED * (dt - SLOWDOWN_MS), stage: "brake" };
  const x2 = x1 + SLOW_SPEED * cruiseMs;
  const u = (dt - SLOWDOWN_MS - cruiseMs) / SLOW_DECEL_MS;
  return { x: x2 + (peak - x2) * (1 - (1 - u) ** 3), stage: "brake" };
}
