// Туман войны: игрок видит клетки в радиусе 2 гексов от себя, разведанное
// запоминается между заходами. Под туманом не видно ни местности, ни
// объектов — сначала дойди.
//
// Память двухуровневая: устройство (localStorage, битами) рисует карту
// мгновенно, сервер держит общий для аккаунта список (useFogSync) — открытое
// с телефона видно и с компьютера.
//
// Разведанное — битовая маска по номерам клеток (fogMask), а не набор из
// десятков тысяч строк: шаг героя ставит несколько битов и не копирует
// ничего. React получает лёгкий снимок (fogView) с номером версии.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hexDistance } from "./hexGeometry";
import { useFogSync } from "./useFogSync";
import { onFogReveal } from "./fogReveal";
import { FogMask, fogView, type Bounds, type FogView } from "./fogMask";
import type { MapStore } from "./mapStore";
import { forgetFog, loadFogBits, saveFogBits } from "./fogStorage";
import { fogOfMap } from "./fogGuards";

export const VISION_RADIUS = 2;

/**
 * `visible` — что видно прямо сейчас (радиус вокруг игрока), ключами и
 * номерами; `seen` — всё, что игрок когда-либо открывал на этой карте.
 */
export function useFogOfWar(
  store: MapStore | null,
  mapId: string | null,
  playerPos: { q: number; r: number } | null,
) {
  const radius = VISION_RADIUS;
  const [seen, setSeen] = useState<FogView | null>(null);
  const maskRef = useRef<FogMask | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maskMapId = useRef<string | null>(null);

  // Новая карта — своя маска (разведанное другой карты сюда не переносим);
  // новая сетка той же карты (расширили) — маска перекладывается.
  useEffect(() => {
    if (!store || !mapId) return;
    let mask = maskRef.current;
    if (!mask || maskMapId.current !== mapId) {
      mask = new FogMask(store);
      loadFogBits(mapId, store, mask);
      maskMapId.current = mapId;
    } else {
      mask = mask.rebind(store);
    }
    maskRef.current = mask;
    setSeen(fogView(mask));
  }, [store, mapId]);

  /**
   * Запись откладываем: на каждом шаге писать биты незачем — раз в 600 мс
   * после последнего изменения. Биты, не строки: ~10 КБ вместо 0,8 МБ.
   */
  const scheduleSave = useCallback((id: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const mask = maskRef.current;
      // Сетка — та, к которой привязана маска: биты и подпись из одного места.
      if (mask) saveFogBits(id, mask.store, mask);
    }, 600);
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  // Пришли на новую клетку — открываем всё вокруг в радиусе обзора.
  useEffect(() => {
    const mask = maskRef.current;
    if (!mask || !mapId || !playerPos) return;
    if (mask.addDisc(playerPos.q, playerPos.r, radius) > 0) {
      mask.version++;
      setSeen(fogView(mask));
      scheduleSave(mapId);
    }
  }, [mapId, playerPos?.q, playerPos?.r, radius, scheduleSave, seen?.mask]);

  /** Влить в память клетки, открытые на другом устройстве. */
  const merge = useCallback(
    (cells: string[] | Uint8Array) => {
      const mask = maskRef.current;
      if (!mask || cells.length === 0) return;
      const added = cells instanceof Uint8Array ? mask.addBits(cells) : mask.addMany(cells);
      if (added > 0) {
        mask.version++;
        setSeen(fogView(mask));
        if (mapId) scheduleSave(mapId);
      }
    },
    [mapId, scheduleSave],
  );

  /** Сервер этот этаж забыл — начинаем его на устройстве с чистого листа. */
  const reset = useCallback(() => {
    if (!store || !mapId) return;
    forgetFog(mapId);
    const mask = new FogMask(store);
    maskRef.current = mask;
    maskMapId.current = mapId;
    setSeen(fogView(mask));
  }, [store, mapId]);

  // Маска собрана под ДРУГУЮ сетку (кадр перехода порталом на другой этаж:
  // карта уже новая, маска ещё прежняя) — она чужая. Раньше на этот кадр
  // синхронизация отправляла всё разведанное прежнего этажа как разведанное
  // нового, а пришедшее с сервера вливала в прежний (накладка, 07.10.2026).
  const own = fogOfMap(seen, maskMapId.current, mapId);

  useFogSync({ mapId, seen: own, merge, reset });

  // Разведка с обзорной вышки открывает клетки без ходьбы — вливаем их сразу.
  useEffect(() => onFogReveal(merge), [merge]);

  /** Клетки в текущем радиусе обзора — они ярче разведанных. Ключами и номерами. */
  const visible = useMemo(() => {
    const keys = new Set<string>();
    const idx = new Set<number>();
    if (!playerPos) return { keys, idx };
    for (let dq = -radius; dq <= radius; dq++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const q = playerPos.q + dq;
        const r = playerPos.r + dr;
        if (hexDistance(playerPos.q, playerPos.r, q, r) > radius) continue;
        keys.add(`${q},${r}`);
        const i = store ? store.index(q, r) : -1;
        if (i >= 0) idx.add(i);
      }
    }
    return { keys, idx };
  }, [playerPos?.q, playerPos?.r, radius, store]);

  /** Прямоугольник по разведанному + 1 клетка запаса: дальше карту не рисуем. */
  const bounds = useMemo((): Bounds => {
    const b = own?.mask.bounds;
    let minQ = b ? b.minQ : Infinity;
    let maxQ = b ? b.maxQ : -Infinity;
    let minR = b ? b.minR : Infinity;
    let maxR = b ? b.maxR : -Infinity;
    if (playerPos) {
      minQ = Math.min(minQ, playerPos.q - radius);
      maxQ = Math.max(maxQ, playerPos.q + radius);
      minR = Math.min(minR, playerPos.r - radius);
      maxR = Math.max(maxR, playerPos.r + radius);
    }
    if (minQ === Infinity) return null;
    return { minQ: minQ - 1, maxQ: maxQ + 1, minR: minR - 1, maxR: maxR + 1 };
  }, [own, playerPos?.q, playerPos?.r, radius]);

  return { seen: own, visible, bounds };
}
