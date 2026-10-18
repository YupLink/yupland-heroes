// Словарь «q,r → Cell» поверх колонок — для старого кода, которому нужен
// объект по строковому ключу (тап, соседи, редкие проверки).
import type { Cell } from "./unpackMap";
import type { MapStore } from "./mapStore";

/** Ключ, по которому словарь-Proxy отдаёт сам store (для горячих мест: поиск пути). */
export const STORE = Symbol("mapStore");

/** Достать store из словаря клеток, если это наш Proxy. */
export function storeOf(cells: object | null | undefined): MapStore | null {
  return cells
    ? (((cells as Record<symbol, unknown>)[STORE] as MapStore | undefined) ?? null)
    : null;
}

/**
 * Словарь «q,r → Cell» без 82 тысяч объектов: клетка собирается при
 * обращении. Перебор (Object.keys / for-in) отдаёт все ключи — это дорого,
 * и горячие места (кадр, поиск пути, миникарта) ходят по колонкам напрямую.
 */
export function makeCellsProxy(s: MapStore): Record<string, Cell> {
  const target: Record<string, Cell> = {};
  return new Proxy(target, {
    get(_t, prop) {
      if (prop === STORE) return s;
      if (typeof prop !== "string") return undefined;
      const i = s.indexOfKey(prop);
      return i >= 0 ? s.cellAt(i) : undefined;
    },
    has(_t, prop) {
      return typeof prop === "string" && s.indexOfKey(prop) >= 0;
    },
    ownKeys() {
      const keys: string[] = new Array(s.n);
      for (let i = 0; i < s.n; i++) keys[i] = s.key(i);
      return keys;
    },
    getOwnPropertyDescriptor(_t, prop) {
      if (typeof prop !== "string") return undefined;
      const i = s.indexOfKey(prop);
      if (i < 0) return undefined;
      return { enumerable: true, configurable: true, writable: false, value: s.cellAt(i) };
    },
  });
}
