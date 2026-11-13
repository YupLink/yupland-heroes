// Входы окна «Карта», которые меняют ССЫЛКУ без смены содержимого.
//
// Каждое событие живой карты (чужой бой, беглец, постройка — 20–50 в минуту)
// даёт новые колонки карты, новый словарь клеток и новый снимок тумана. Окно
// сравнивало их по ссылке и на каждое событие заново перебирало всё
// разведанное и пекло картинку ландшафта 2048×2048 (замер на проде 23.10.2026:
// 18 картинок по 16 МБ за 45 секунд, долгие задачи до 147 мс на телефоне ×4).
// Здесь — «отпечаток» содержимого: совпал — отдаём прежнюю ссылку.
import { useRef } from "react";
import { storeOf } from "../mapCellsProxy";
import type { FogView, KeySet } from "../fogMask";
import type { Landscape } from "./terrainGeometry";

export type Stamp = readonly unknown[];

export function sameStamp(a: Stamp, b: Stamp): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/**
 * Разведанное: снимок тумана — та же маска и та же версия, значит те же
 * клетки (купол — числом клеток под ним). Прочие наборы — по ссылке.
 */
export function keySetStamp(seen: KeySet): Stamp {
  const view = seen as Partial<FogView>;
  if (view.mask && typeof view.version === "number")
    return [view.mask, view.version, seen.size, view.mask.store.dome.size];
  return [seen];
}

/**
 * Ландшафт: словарь поверх колонок карты меняет местность, только если
 * сменились сами колонки местности/координат или словарь картинок. Правки
 * объектов эти колонки не трогают (PackedEdit клонирует только затронутое).
 */
export function landscapeStamp(landscape: Landscape | undefined): Stamp {
  const store = landscape ? storeOf(landscape.cells) : null;
  if (!store) return [landscape];
  const p = store.packed;
  return [p.q, p.r, p.t, p.terrainIds, landscape?.terrains];
}

/** Местность клетки по ключу — колонкой напрямую, без сборки объекта клетки. */
export function terrainLookup(
  landscape: Landscape | undefined,
): (key: string) => string | undefined {
  if (!landscape) return () => undefined;
  const store = storeOf(landscape.cells);
  if (store)
    return (key) => {
      const i = store.indexOfKey(key);
      return i >= 0 ? store.terrainId(i) : undefined;
    };
  return (key) => landscape.cells[key]?.terrainId;
}

/** Прежняя ссылка, пока отпечаток содержимого тот же. */
export function useStable<T>(value: T, stamp: (v: T) => Stamp): T {
  const kept = useRef<{ value: T; stamp: Stamp } | null>(null);
  const next = stamp(value);
  if (!kept.current || !sameStamp(kept.current.stamp, next)) kept.current = { value, stamp: next };
  return kept.current.value;
}
