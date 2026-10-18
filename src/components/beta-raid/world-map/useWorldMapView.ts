// Холст карты мира: размер, картинка местности, камера и кадр по требованию.
//
// Местность печётся в картинку один раз на ответ сервера (paintTerrain), кадр
// кладёт её одним drawImage и ставит сверху несколько сотен меток. Камера
// живёт в ref, а не в state: React в кадре не участвует (yuplink-perf §1).
// Кадр не крутится сам — рисуем, только когда что-то сдвинулось (жест,
// доехали цвета, сменился размер), в покое цикл спит.
import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { MAP_ART } from "@/lib/gameArt";
import type { WorldMapMode } from "@/lib/raid/worldMapCodec";
import { clampCam, fitCam, zoomAt, type Cam } from "./worldMapCamera";
import { drawWorldMap } from "./worldMapDraw";
import { paintTerrain, type WorldMapModel } from "./worldMapModel";
import { EMPTY_SCENE, pickCell, sceneOf, visibleScene, type Cell } from "./worldMapScene";
import type { TerrainPalette } from "./useTerrainPalette";
import type { WorldLayer } from "./worldMapLayers";

/** Ближе не приближаем: клетка ~46×40 px — дальше смысла нет. */
const MAX_S = 40;
/** Маленькую разведку при открытии не раздуваем во весь экран. */
const FIT_MAX_S = 16;
const PAD = 16;
/** Сколько карты остаётся на экране, как её ни тяни. */
const KEEP = 48;
/** Тап в пределах стольких пикселей от метки, героя или замка — это тап по ним. */
const SNAP_PX = 22;

export type WorldMapCtl = {
  getCam: () => Cam;
  setCam: (c: Cam) => void;
  /** Зум к масштабу s вокруг точки экрана (масштаб ограничивается). */
  zoomTo: (s: number, sx: number, sy: number) => void;
  limit: (s: number) => number;
  /** Клетка под тапом: метка/герой/замок рядом или клетка с местностью; иначе null. */
  pick: (sx: number, sy: number) => Cell | null;
};

export function useWorldMapView(input: {
  wrapRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  model: WorldMapModel | null;
  palette: TerrainPalette | null;
  heroQ: number | null;
  heroR: number | null;
  castleQ: number;
  castleR: number;
  /** Выключенные в легенде виды: не рисуются и не ловят тап. */
  hidden: ReadonlySet<WorldLayer>;
}): WorldMapCtl {
  const { wrapRef, canvasRef, model, palette, heroQ, heroR, castleQ, castleR, hidden } = input;
  const cam = useRef<Cam>({ s: 1, ox: 0, oy: 0 });
  const view = useRef({ w: 0, h: 0, dpr: 1 });
  const image = useRef<HTMLCanvasElement | null>(null);
  const castleImg = useRef<HTMLImageElement | null>(null);
  /** Для какого режима камера уже вписана: свежий ответ того же режима вид не сбрасывает. */
  const fitted = useRef<WorldMapMode | null>(null);
  const raf = useRef<number | null>(null);
  const modelRef = useRef(model);
  modelRef.current = model;

  const full = useMemo(() => {
    if (!model) return EMPTY_SCENE;
    const hero = heroQ != null && heroR != null ? { q: heroQ, r: heroR } : null;
    return sceneOf(model, hero, { q: castleQ, r: castleR });
  }, [model, heroQ, heroR, castleQ, castleR]);
  // Тап по легенде — только отбор готовых точек; рамка та же, камера не прыгает.
  const scene = useMemo(() => visibleScene(full, hidden), [full, hidden]);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const draw = useCallback(() => {
    raf.current = null;
    const g = canvasRef.current?.getContext("2d");
    if (!g) return;
    const v = view.current;
    const s = sceneRef.current;
    drawWorldMap(g, {
      cam: cam.current,
      dpr: v.dpr,
      viewW: v.w,
      viewH: v.h,
      image: image.current,
      marks: s.marks,
      castle: s.castle,
      castleImg: castleImg.current,
      hero: s.hero,
    });
  }, [canvasRef]);

  const requestDraw = useCallback(() => {
    if (raf.current == null) raf.current = requestAnimationFrame(draw);
  }, [draw]);

  const limit = useCallback((s: number) => {
    const v = view.current;
    const b = sceneRef.current.box;
    const fit = Math.min(
      (v.w - 2 * PAD) / Math.max(1e-6, b.x1 - b.x0),
      (v.h - 2 * PAD) / Math.max(1e-6, b.y1 - b.y0),
    );
    // Отдалять — до половины «вся карта в экране», приближать — до MAX_S.
    const minS = Math.min(MAX_S, Math.max(1e-3, fit * 0.5));
    return Math.max(minS, Math.min(MAX_S, s));
  }, []);

  const setCam = useCallback(
    (next: Cam) => {
      const v = view.current;
      cam.current = clampCam(next, sceneRef.current.box, v.w, v.h, KEEP);
      requestDraw();
    },
    [requestDraw],
  );

  const zoomTo = useCallback(
    (s: number, sx: number, sy: number) => setCam(zoomAt(cam.current, limit(s), sx, sy)),
    [limit, setCam],
  );

  /**
   * Камера под новый размер или ответ: первый ответ режима — вписать карту
   * целиком, дальше (свежий ответ того же режима, поворот экрана) — оставить
   * вид и лишь не дать ему уехать за край.
   */
  const settle = useCallback(() => {
    const v = view.current;
    if (!v.w || !v.h) return;
    const box = sceneRef.current.box;
    const mode = modelRef.current?.mode ?? null;
    if (mode !== null && fitted.current !== mode) {
      fitted.current = mode;
      cam.current = fitCam(box, v.w, v.h, PAD, FIT_MAX_S);
    } else cam.current = clampCam(cam.current, box, v.w, v.h, KEEP);
    requestDraw();
  }, [requestDraw]);

  // Размер холста — сразу, дальше по ResizeObserver с паузой 100 мс (§9.2).
  useEffect(() => {
    const wrap = wrapRef.current;
    const cv = canvasRef.current;
    if (!wrap || !cv) return;
    const measure = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      view.current = { w, h, dpr };
      cv.width = Math.max(1, Math.round(w * dpr));
      cv.height = Math.max(1, Math.round(h * dpr));
      settle();
    };
    measure();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ro = new ResizeObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        measure();
      }, 100);
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [wrapRef, canvasRef, settle]);

  // Местность — в картинку, один проход по сетке. Палитра обязана быть
  // собрана под этот же словарь местности, иначе цвета легли бы не туда.
  useEffect(() => {
    if (!model || model.imgW === 0) {
      image.current = null;
      requestDraw();
      return;
    }
    if (!palette || palette.terrains !== model.terrains) return;
    const c = image.current ?? document.createElement("canvas");
    if (c.width !== model.imgW || c.height !== model.imgH) {
      c.width = model.imgW;
      c.height = model.imgH;
    }
    const g = c.getContext("2d");
    if (!g) return;
    const data = g.createImageData(model.imgW, model.imgH);
    paintTerrain(model, palette.bytes, data.data);
    g.putImageData(data, 0, 0);
    image.current = c;
    requestDraw();
  }, [model, palette, requestDraw]);

  // Пришёл ответ (или другой режим) — камера под него.
  useEffect(() => {
    if (model) settle();
  }, [model, settle]);

  // Герой сделал шаг или вид включили/выключили — перерисовать метки.
  useEffect(() => {
    requestDraw();
  }, [scene, requestDraw]);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      castleImg.current = img;
      requestDraw();
    };
    img.src = MAP_ART.castle;
    return () => {
      img.onload = null;
    };
  }, [requestDraw]);

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current);
      raf.current = null;
    },
    [],
  );

  const pick = useCallback(
    (sx: number, sy: number): Cell | null =>
      pickCell(sceneRef.current, modelRef.current, cam.current, sx, sy, SNAP_PX),
    [],
  );

  const getCam = useCallback(() => cam.current, []);
  return useMemo(
    () => ({ getCam, setCam, zoomTo, limit, pick }),
    [getCam, setCam, zoomTo, limit, pick],
  );
}
