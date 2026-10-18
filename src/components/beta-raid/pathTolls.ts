// Плата за двери на маршруте — чистая арифметика без React.
//
// Маршрут может пройти сквозь несколько дверей; каждая берёт своё в момент
// шага на её клетку (gate-toll). Плашка маршрута показывает СУММУ заранее —
// одной строкой на ресурс, как сводит цены корзина маркета: «100 золота ·
// 1 алмаз», а не «50 золота · 50 золота · 1 алмаз».
//
// Туман войны здесь не учитывается: дверь на неразведанной клетке пути тоже
// попадёт в сумму. Существование двери клиент и так знает по списку doors —
// разведки цена не выдаёт.
import { heroLevelFits, type PortalConfig, type PortalPrice } from "@/lib/portal";

export type DoorTollMap = Readonly<Record<string, PortalConfig>>;

/** Ключ слияния: золото с золотом, Darai с Darai, яблоко с яблоком. */
const mergeKey = (p: PortalPrice): string => `${p.resource}|${p.token ?? ""}|${p.itemKey ?? ""}`;

/**
 * Сумма цен всех дверей на пути. Пустой список — дверей на пути нет либо
 * все они бесплатные.
 */
export function pathTolls(
  path: ReadonlyArray<{ q: number; r: number }>,
  tolls: DoorTollMap | undefined,
): PortalPrice[] {
  if (!tolls) return [];
  const merged = new Map<string, PortalPrice>();
  for (const step of path) {
    const cfg = tolls[`${step.q},${step.r}`];
    if (!cfg) continue;
    for (const p of cfg.prices) {
      const key = mergeKey(p);
      const have = merged.get(key);
      if (have) have.amount += p.amount;
      else merged.set(key, { ...p });
    }
  }
  return [...merged.values()];
}

/**
 * Энергия из цены двери — отдельно: её дверь списывает через тот же счётчик,
 * что и шаг (touch_energy_atomic ДО spendEnergy), поэтому она обязана войти в
 * «дорогу» плашки, иначе кнопка «Идти» обещала бы проход, а сервер отказал бы
 * у самой двери. Остальные ресурсы рисуются своей строкой.
 */
export function splitToll(prices: PortalPrice[]): { energy: number; rest: PortalPrice[] } {
  let energy = 0;
  const rest: PortalPrice[] = [];
  for (const p of prices) {
    if (p.resource === "energy") energy += p.amount;
    else rest.push(p);
  }
  return { energy, rest };
}

/**
 * Двери, которые остаются СТЕНОЙ и для маршрута «сквозь двери»:
 *   • дверь, цены которой клиент не знает (снимок карты старее ответа с
 *     ценами) — вести сквозь неё значило бы списать молча;
 *   • дверь с рамками уровня, куда выбранный герой не проходит, — сервер
 *     отказал бы на шаге, и маршрут оборвался бы посреди пути.
 * undefined — цены ещё не приехали: сквозь двери не ведём вовсе.
 */
export function hardDoorsOf(
  doors: ReadonlySet<string>,
  tolls: DoorTollMap | undefined,
  heroLevel: number | null,
): ReadonlySet<string> | undefined {
  if (!tolls) return undefined;
  const hard = new Set<string>();
  for (const key of doors) {
    const cfg = tolls[key];
    if (!cfg || !heroLevelFits(cfg, heroLevel)) hard.add(key);
  }
  return hard;
}

/** Есть ли на пути дверь — по списку дверей карты, цены знать не нужно. */
export function pathCrossesDoor(
  path: ReadonlyArray<{ q: number; r: number }>,
  doors: ReadonlySet<string> | undefined,
): boolean {
  if (!doors || doors.size === 0) return false;
  return path.some((s) => doors.has(`${s.q},${s.r}`));
}
