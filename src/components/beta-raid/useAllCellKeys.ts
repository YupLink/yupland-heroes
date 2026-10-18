// Все клетки карты — одним набором и одной ссылкой.
//
// Нужен только режиму админа «карта открыта целиком»: по нему миникарта
// рисует всю карту, а камера получает границы на всю карту. Кадру он больше
// не нужен вовсе — тому хватает булева признака (см. useFogView).
//
// Набор не материализует 82 тысячи строк: это взгляд на колонки (mapStore) —
// has по сетке, size из числа клеток, перебор ключей по требованию. Ссылка
// живёт, пока живёт сама сетка.
import { useMemo } from "react";
import type { MapStore } from "./mapStore";
import type { KeySet } from "./fogMask";

/** Пустой набор одной ссылкой: новая ссылка будит кадр карты. */
const EMPTY: KeySet = new Set<string>();

const cache = new WeakMap<object, KeySet>();

export function allCellKeys(store: MapStore): KeySet {
  const key = store.geom;
  const hit = cache.get(key);
  if (hit) return hit;
  const set: KeySet = {
    has: (k) => store.indexOfKey(k) >= 0,
    get size() {
      return store.n;
    },
    *[Symbol.iterator]() {
      for (let i = 0; i < store.n; i++) yield store.key(i);
    },
  };
  cache.set(key, set);
  return set;
}

export function useAllCellKeys(store: MapStore | null, enabled: boolean): KeySet {
  return useMemo(() => (enabled && store ? allCellKeys(store) : EMPTY), [store, enabled]);
}
