// Службы по одной, в порядке крутизны ренты — шаг 9 спецификации
// (docs/town-generation-algorithm.json).
//
// Алонсо / фон Тюнен: у власти и торговли самая крутая кривая ренты, они и
// выигрывают ядро; вредное ремесло и учреждения краевого пояса встают
// последними и достаются краю (Конзен). Поэтому порядок фиксирован, а клетку
// каждой службе выбирает интерес (zoning.ts).
import { keyOf } from "@/lib/raid/zonegen/town/hex";
import { commit, placeByInterest, type TownState } from "@/lib/raid/zonegen/town/place-state";
import type { TownPick, TownRole } from "@/lib/raid/zonegen/town/types";

/** Порядок крутизны ренты (шаг 9): ратуша → храм → рынок №1 → таверна №1 → … → вышки. */
const RENT_ORDER: readonly TownRole[] = [
  "town_hall",
  "temple",
  "market",
  "tavern",
  "warehouse",
  "shipyard",
  "barracks",
  "armory",
  "forge",
  "university",
  "museum",
  "arena",
  "watchtower",
];

/** Второй рынок и вторая таверна ставятся по покрытию — после всех служб (шаг 10). */
const BY_COVERAGE: ReadonlySet<TownRole> = new Set(["market", "tavern"]);

export type Queued = { pick: TownPick; nth: number };

export type TownQueue = {
  hall: TownPick | null;
  services: Queued[];
  /** Покои знати: к ядру по интересу, не нашлось — простым домом. */
  chambers: TownPick[];
  homes: TownPick[];
};

/**
 * Разложить состав по очереди. Ратуша строго одна: лишние из ручного
 * состава встают простыми домами — второе «сердце» городу не положено.
 */
export function queueOf(picks: TownPick[]): TownQueue {
  const q: TownQueue = { hall: null, services: [], chambers: [], homes: [] };
  const nth = new Map<TownRole, number>();
  for (const pick of picks) {
    if (pick.role === "town_hall") {
      if (q.hall === null) q.hall = pick;
      else q.homes.push({ ...pick, role: "house" });
    } else if (pick.role === "chambers") q.chambers.push(pick);
    else if (pick.role === "house") q.homes.push(pick);
    else {
      const k = nth.get(pick.role) ?? 0;
      nth.set(pick.role, k + 1);
      q.services.push({ pick, nth: k });
    }
  }
  const rank = (x: Queued): number =>
    RENT_ORDER.indexOf(x.pick.role) +
    (x.nth > 0 && BY_COVERAGE.has(x.pick.role) ? RENT_ORDER.length : 0);
  // sort стабилен: внутри роли остаётся порядок подборки.
  q.services.sort((a, b) => rank(a) - rank(b));
  return q;
}

/**
 * Ратуша — в медоид (Краков, Вроцлав: ратуша посреди Рынка). Центр занят
 * или под дорогой — лот у площади поближе к нему, по интересу.
 */
function placeHall(state: TownState, pick: TownPick): boolean {
  const c = state.skeleton.center;
  const k = keyOf(c);
  const free =
    state.fields.land.has(k) &&
    !state.occupied.has(k) &&
    !state.index.rank.has(k) &&
    !state.index.green.has(k);
  if (free) {
    commit(state, c, pick, null);
    return true;
  }
  return placeByInterest(state, pick, 0);
}

export type ServicesResult = {
  /** Службы, которым места не нашлось даже с новой улицей: второй заход — после домов. */
  failed: Queued[];
  /** Что пойдёт в жильё: дома плюс покои, которым не нашлось места в ядре. */
  homes: TownPick[];
};

/** Ратуша, службы, покои — жадно, по одной; жильё возвращается дальше. */
export function placeServices(state: TownState, queue: TownQueue): ServicesResult {
  const failed: Queued[] = [];
  if (queue.hall !== null && !placeHall(state, queue.hall))
    failed.push({ pick: queue.hall, nth: 0 });
  for (const q of queue.services) if (!placeByInterest(state, q.pick, q.nth)) failed.push(q);
  const homes: TownPick[] = [];
  for (const pick of queue.chambers) {
    if (!placeByInterest(state, pick, 0)) homes.push({ ...pick, role: "house" });
  }
  return { failed, homes: [...homes, ...queue.homes] };
}

/**
 * Второй заход для служб после жилья. Улица растёт только в двух клетках от
 * построек (шаг 10), и верфи у дальнего берега до домов тянуть её не к чему;
 * когда дома встали, путь есть. Не встала и теперь — это недобор (шаг 9:
 * пропуск с причиной, без насильной установки). Возвращает недобор.
 */
export function retryServices(state: TownState, failed: Queued[]): number {
  let shortfall = 0;
  for (const q of failed) if (!placeByInterest(state, q.pick, q.nth)) shortfall++;
  return shortfall;
}
