// Режим админа «карта открыта целиком»: временное снятие тумана войны ТОЛЬКО
// на показ.
//
// В базу не пишем ничего. Личный туман админа (`beta_raid_fog`) он же и играет,
// а «Мир Альфа» — 16 384 клетки: запись их в jsonb и в localStorage замусорила
// бы разведанное навсегда и обратно уже не откатилась. Здесь тумблер: нажал —
// видно всё, нажал ещё раз — вернулся ровно тот туман, что был.
//
// Шина, а не проп: кнопка живёт в панели правки, туман — внутри канваса. Проп
// между ними пришлось бы вести через экран рейда, который по §13.6 остаётся
// оркестратором.
import { useSyncExternalStore } from "react";

const storageKey = (mapId: string) => `beta-raid-fog-all:${mapId}`;

const listeners = new Set<() => void>();

/** Снимок для useSyncExternalStore обязан быть стабильным между рендерами —
 *  ходить в localStorage на каждый вызов нельзя, поэтому держим ответ здесь. */
const cache = new Map<string, boolean>();

function read(mapId: string): boolean {
  const known = cache.get(mapId);
  if (known !== undefined) return known;
  let on = false;
  try {
    on = window.localStorage.getItem(storageKey(mapId)) === "1";
  } catch {
    /* приватный режим браузера — режим просто не запомнится */
  }
  cache.set(mapId, on);
  return on;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Включить/выключить раскрытие карты. Переживает перезагрузку страницы. */
export function setAdminFogReveal(mapId: string, on: boolean): void {
  cache.set(mapId, on);
  try {
    if (on) window.localStorage.setItem(storageKey(mapId), "1");
    else window.localStorage.removeItem(storageKey(mapId));
  } catch {
    /* не записалось — в этой вкладке режим всё равно работает */
  }
  for (const l of listeners) l();
}

/** Просит ли админ показать карту целиком. Право на это проверяется отдельно
 *  (сессия с сервера) — сам по себе флаг никому ничего не открывает. */
export function useAdminFogReveal(mapId: string | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (mapId ? read(mapId) : false),
    () => false,
  );
}
