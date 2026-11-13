// Закладки героев в таверне: правила списка, общие для экрана и сервера.
//
// Закладка — ключ героя: `item:<копия предмета>` или `hero:<экземпляр>` (как
// heroKey в TavernHeroOrder). До 04.11.2026 список жил в localStorage
// устройства, и закреплённое на телефоне на ПК не было видно (жалоба игрока).
// Теперь он на аккаунте; старый список устройства один раз доезжает туда.

/** Потолок закладок. Самая большая коллекция на проде — 105 героев (04.11.2026). */
export const MAX_TAVERN_PINS = 200;

/** Ключ героя, который можно закрепить. Шаблон (`template:`) — не герой. */
export const TAVERN_PIN_KEY = /^(item|hero):[A-Za-z0-9_-]{1,80}$/;

/** Правка списка: что закрепить и что открепить. */
export type TavernPinsPatch = { add: string[]; remove: string[] };

/**
 * Список после правки: снятые убраны, новые дописаны в конец, повторов нет,
 * не длиннее потолка. Сервер считает так же, но ещё и сверяет хозяина героя.
 */
export function applyPinsPatch(
  pins: readonly string[],
  patch: TavernPinsPatch,
  cap = MAX_TAVERN_PINS,
): string[] {
  const removed = new Set(patch.remove);
  const out: string[] = [];
  for (const key of [...pins, ...patch.add]) {
    if (out.length >= cap) break;
    if (!removed.has(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** Правка для щелчка по закладке героя. */
export function togglePinPatch(pins: readonly string[], key: string): TavernPinsPatch {
  return pins.includes(key) ? { add: [], remove: [key] } : { add: [key], remove: [] };
}

/** Строки-ключи из чего угодно (ответ сервера, старый JSON устройства). */
export function pinKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.filter((key): key is string => typeof key === "string" && TAVERN_PIN_KEY.test(key)),
    ),
  ];
}

/**
 * Что из старых закладок устройства ещё не лежит на аккаунте. Чужие герои
 * (на устройстве бывают разные аккаунты) отсеет сервер.
 */
export function legacyPinsToImport(raw: string | null, server: readonly string[]): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const have = new Set(server);
  return pinKeys(parsed)
    .filter((key) => !have.has(key))
    .slice(0, MAX_TAVERN_PINS);
}
