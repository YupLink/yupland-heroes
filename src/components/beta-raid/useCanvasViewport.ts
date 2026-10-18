// Камера карты: плавное движение, пинч-зум, центрирование на точке.
//
// Камера живёт в ref'ах, а не в state: раньше каждый кадр сглаживания вызывал
// setState, то есть перерисовывал всё дерево React 60 раз в секунду. Теперь
// кадр двигает камеру через stepCamera(), а рисует канвас — React в этом
// цикле не участвует вовсе.
//
// follow (мягкое следование за героем) вызывается КАЖДЫЙ КАДР внутри
// stepCamera, а не из React-эффекта. Иначе камера: прыг → стоп → ждёт
// рендер → прыг → стоп — видимое дёрганье.
import { useCallback, useRef } from "react";
import type React from "react";
import { axialToPixel } from "./hexGeometry";
import { clampToBounds, type Bounds } from "./viewportClamp";
import { useViewportGestures } from "./useViewportGestures";

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
/** Доля пути за кадр: больше — резче, меньше — «ватнее». */
const EASE = 0.18;
/** Как сильно pull тянет цель к герою за кадр (0.06 ≈ за ~1 сек до центра). */
const FOLLOW_PULL = 0.06;
/** Мёртвая зона: герой в центральных DEAD_ZONE*100 % — камера стоит. */
const DEAD_ZONE = 0.15;

export function useCanvasViewport(
  mapSize: number,
  bounds: Bounds,
  requestRedraw: () => void,
  /** Обёртка канваса — по ней клэмп берёт актуальный размер вьюпорта (W/H). */
  wrapRef: React.RefObject<HTMLDivElement | null>,
) {
  // Цель камеры и зума — к ним стремится текущее положение.
  const targetOffset = useRef({ x: 0, y: 0 });
  const targetScale = useRef(1.2);
  // Текущее (анимируемое) положение — источник правды для кадров.
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1.2);

  const c0q = Math.floor(mapSize / 2);
  const centerQ = c0q - Math.floor((c0q - (c0q & 1)) / 2);

  // Границы меняются с каждой разведанной клеткой; держим их в ref, чтобы
  // moveTo/centerOn не пересоздавались на каждый шаг героя.
  const clampRef = useRef((next: { x: number; y: number }, s: number) => next);
  clampRef.current = (next, s) => {
    const wrap = wrapRef.current;
    return clampToBounds(
      next,
      s,
      bounds,
      centerQ,
      c0q,
      wrap?.clientWidth ?? 0,
      wrap?.clientHeight ?? 0,
    );
  };

  // ── Follow: мягкий трекинг героя в каждом кадре ──
  // setFollowTarget вызывается из React-эффекта при смене позиции героя.
  // Сам follow-пулл живёт в stepCamera — каждый кадр, без участия React.
  const followTarget = useRef<{ q: number; r: number } | null>(null);
  const followActive = useRef(false);

  /** Включить следование за клеткой (вызывается из useEffect при ходьбе). */
  const setFollowTarget = useCallback(
    (q: number, r: number) => {
      followTarget.current = { q, r };
      followActive.current = true;
      requestRedraw();
    },
    [requestRedraw],
  );

  /** Выключить следование (пользователь начал драг / пинч). */
  const stopFollow = useCallback(() => {
    followActive.current = false;
  }, []);

  /**
   * «Припаркована» — камеру явно увезли к замку/точке миникарты/клетке, и
   * шаги героя её не возвращают, даже если он идёт по маршруту (жалоба
   * 21.09: «место перекидывается на героя и фиксируется на нём, даже когда
   * герой движется»). Снимает парковку новый маршрут или кнопка «К герою».
   */
  const parked = useRef(false);
  const park = useCallback(() => {
    parked.current = true;
    followActive.current = false;
  }, []);
  const unpark = useCallback(() => {
    parked.current = false;
  }, []);

  /**
   * Один кадр сглаживания. true — камера ещё едет, нужен следующий кадр.
   *
   * Порядок: сначала follow-пулл (тянет targetOffset к герою), потом lerp
   * (offset → targetOffset). Оба в одном кадре — камера движется непрерывно.
   */
  const stepCamera = useCallback(() => {
    // ── Follow-пулл: каждый кадр, пока followActive ──
    if (followActive.current && followTarget.current) {
      const wrap = wrapRef.current;
      const W = wrap?.clientWidth ?? 0;
      const H = wrap?.clientHeight ?? 0;
      if (W > 0 && H > 0) {
        const { q, r } = followTarget.current;
        const p = axialToPixel(q, r, centerQ, c0q);
        const s = targetScale.current;
        // Где герой на экране прямо сейчас.
        const sx = W / 2 + targetOffset.current.x + p.x * s;
        const sy = H / 2 + targetOffset.current.y + p.y * s;
        const offX = sx - W / 2;
        const offY = sy - H / 2;
        const padX = W * DEAD_ZONE;
        const padY = H * DEAD_ZONE;
        if (Math.abs(offX) > padX || Math.abs(offY) > padY) {
          targetOffset.current = clampRef.current(
            {
              x: targetOffset.current.x - offX * FOLLOW_PULL,
              y: targetOffset.current.y - offY * FOLLOW_PULL,
            },
            s,
          );
        }
      }
    }

    // ── Lerp: offset → targetOffset ──
    const t = targetOffset.current;
    const dx = t.x - offsetRef.current.x;
    const dy = t.y - offsetRef.current.y;
    const ds = targetScale.current - scaleRef.current;
    const doneMove = Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5;
    const doneZoom = Math.abs(ds) < 0.001;

    offsetRef.current = doneMove
      ? { ...t }
      : { x: offsetRef.current.x + dx * EASE, y: offsetRef.current.y + dy * EASE };
    scaleRef.current = doneZoom ? targetScale.current : scaleRef.current + ds * EASE;
    return !doneMove || !doneZoom;
  }, [centerQ, c0q, wrapRef]);

  /** Поставить цель камеры (плавно) или дёрнуть мгновенно (при перетаскивании). */
  const moveTo = useCallback(
    (next: { x: number; y: number }, instant = false) => {
      const clamped = clampRef.current(next, targetScale.current);
      targetOffset.current = clamped;
      if (instant) offsetRef.current = clamped;
      requestRedraw();
    },
    [requestRedraw],
  );

  /**
   * Центрировать карту на клетке (герой, замок, точка миникарты, «Добыча»,
   * «Экономика»).
   *
   * Явный прицел отменяет следование за героем до его следующего шага: иначе
   * follow-пулл в stepCamera каждый кадр тянул цель обратно к герою, и камера,
   * долетев к замку, тут же возвращалась (Cerberus, 20.09). После перезагрузки
   * «работало», потому что follow включает только первый шаг (BetaRaidCanvas:
   * первое появление — centerOn без setFollowTarget). Слежение вернёт
   * setFollowTarget из эффекта шага.
   */
  const centerOn = useCallback(
    (q: number, r: number, instant = false) => {
      followActive.current = false;
      const p = axialToPixel(q, r, centerQ, c0q);
      moveTo({ x: -p.x * targetScale.current, y: -p.y * targetScale.current }, instant);
    },
    [centerQ, c0q, moveTo],
  );

  const zoomTo = useCallback(
    (s: number) => {
      const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
      const k = next / targetScale.current;
      targetScale.current = next;
      // Держим центр экрана на месте: иначе карта «уезжает» при зуме.
      targetOffset.current = clampRef.current(
        { x: targetOffset.current.x * k, y: targetOffset.current.y * k },
        next,
      );
      requestRedraw();
    },
    [requestRedraw],
  );

  const zoomBy = useCallback((k: number) => zoomTo(targetScale.current * k), [zoomTo]);

  /** Пере-ограничить текущее смещение под НОВЫЙ размер вьюпорта (ресайз,
   *  переключение полноэкранного): иначе после смены размера край карты
   *  оставался бы внутри экрана и зияло бы чёрное. Мгновенно, без проезда. */
  const reclamp = useCallback(() => {
    const c = clampRef.current(offsetRef.current, scaleRef.current);
    offsetRef.current = c;
    targetOffset.current = clampRef.current(targetOffset.current, targetScale.current);
    requestRedraw();
  }, [requestRedraw]);

  /** Поставить камеру сразу, без доводки (щипок «под пальцами»). Возвращает
   *  итоговый масштаб — он мог упереться в пределы. */
  const setCamera = useCallback(
    (next: { x: number; y: number }, s: number) => {
      const sc = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
      targetScale.current = sc;
      scaleRef.current = sc;
      const c = clampRef.current(next, sc);
      targetOffset.current = c;
      offsetRef.current = c;
      requestRedraw();
    },
    [requestRedraw],
  );
  const clampScale = useCallback((s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)), []);

  // Жесты (драг/пинч) — отдельным хуком: они не зависят от кадра и живут
  // на тех же ref'ах (useViewportGestures).
  const { dragMoved, handlers } = useViewportGestures({
    offsetRef,
    scaleRef,
    targetScale,
    moveTo,
    zoomTo,
    setCamera,
    clampScale,
    stopFollow,
  });

  return {
    offsetRef,
    scaleRef,
    stepCamera,
    zoomBy,
    centerOn,
    setFollowTarget,
    stopFollow,
    parked,
    park,
    unpark,
    reclamp,
    dragMoved,
    handlers,
  };
}

