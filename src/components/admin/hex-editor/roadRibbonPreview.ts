// Дорога в превью гекс-редактора — тем же спрайтом, что и в игре.
//
// Редактор рисовал дорогу по-своему: шесть stroke'ов лентой, а текстуру клал
// createPattern("repeat") — на ленте получалась мелкая мозаика из PNG вместо
// самого рисунка. Игра ленту печёт заранее (roadRibbonCache) и режет картинку
// по её силуэту. Редактор, который рисует не так, как игра, врёт админу о том,
// что тот строит, — поэтому берём ТОТ ЖЕ кэш, а не повторяем геометрию здесь.
import {
  RIBBON_DRAW_H,
  RIBBON_DRAW_W,
  type RoadRibbonCache,
} from "@/components/beta-raid/roadRibbonCache";
import { R as GAME_R, ROAD_DIRS } from "@/components/beta-raid/hexGeometry";
import { COLOR } from "@/components/beta-raid/betaCanvasScene";
import { key } from "./hexShared";
import { pruneRoadMask } from "@/components/beta-raid/roadPrune";

/**
 * Ниже этой ширины спрайт бесполезен: на обзорном зуме редактора (гекс ≈ 2 px)
 * лента ужимается до половины пикселя, и сеть дорог гаснет ровно там, где
 * админ смотрит карту целиком. Прежний код держал пол в 2 px — держим и мы,
 * только вектором: текстуры на таком масштабе всё равно не разглядеть.
 */
const MIN_RIBBON_PX = 2;

/** Клетка редактора глазами дороги: она на клетке одна. */
type RoadCell = { roadId?: string | null };

/**
 * Биты направлений, где лежит ТА ЖЕ дорога. Порядок битов — ROAD_DIRS: по нему
 * же выбираются лучи спрайта, и свой порядок тут разворачивал бы ленты.
 *
 * Именно «та же»: тропа рядом с мостовой — две разные дороги, сшивать их в
 * одну ленту нельзя. Так же считает и карта (mapIndex.roadMaskOf).
 */
export function roadMaskAt(
  cells: Record<string, RoadCell>,
  q: number,
  r: number,
  roadId: string,
): number {
  // Срезки ступенек снимаются так же, как в игре (roadPrune): две стороны, а не три.
  return pruneRoadMask(rawMaskAt(cells, q, r, roadId), (d) =>
    rawMaskAt(cells, q + ROAD_DIRS[d].q, r + ROAD_DIRS[d].r, roadId),
  );
}

function rawMaskAt(cells: Record<string, RoadCell>, q: number, r: number, roadId: string): number {
  if (cells[key(q, r)]?.roadId !== roadId) return 0;
  let mask = 0;
  for (let i = 0; i < ROAD_DIRS.length; i++) {
    const d = ROAD_DIRS[i];
    if (cells[key(q + d.q, r + d.r)]?.roadId === roadId) mask |= 1 << i;
  }
  return mask;
}

/**
 * Положить ленту одним drawImage. Спрайт испечён на игровой радиус гекса, а
 * редактор тянет зум плавно — поэтому под каждый шаг щипка не печём заново, а
 * растягиваем готовый: выпечка на каждое движение пальцев обошлась бы дороже
 * растяжения (спрайт пекётся с двойным запасом по разрешению).
 *
 * Спрайта нет — картинка дороги ещё летит. Ничего не рисуем: кадр после её
 * загрузки придёт сам (img.onload → scheduleRedraw), а заглушка бы мигала.
 */
export function drawRoadRibbon(
  g: CanvasRenderingContext2D,
  ribbons: RoadRibbonCache,
  spot: {
    roadId: string;
    mask: number;
    img: HTMLImageElement | undefined;
    /** Центр гекса на канвасе редактора. */
    cx: number;
    cy: number;
    /** Радиус гекса редактора в пикселях — он же и задаёт растяжение. */
    rPix: number;
  },
): void {
  if (spot.rPix * 0.26 < MIN_RIBBON_PX) {
    drawThinRibbon(g, spot.mask, spot.cx, spot.cy, spot.rPix);
    return;
  }
  const sprite = ribbons.get(spot.roadId, spot.mask, spot.img);
  if (!sprite) return;
  const k = spot.rPix / GAME_R;
  const w = RIBBON_DRAW_W * k;
  const h = RIBBON_DRAW_H * k;
  g.drawImage(sprite, spot.cx - w / 2, spot.cy - h / 2, w, h);
}

/**
 * Лента на обзорном зуме: тонкие линии в 2 px без текстуры. Не «упрощение
 * ради скорости», а единственный способ вообще увидеть дорожную сеть, когда
 * весь гекс занимает пару пикселей.
 *
 * Торцы butt и узел ровно по ширине линии — по тем же причинам, что и у
 * спрайта (roadRibbonCache): круглый торец вылезал за грань, а жирный узел
 * превращал дорогу в цепочку бусин. На обзорном зуме это было заметнее всего:
 * гекс в два пикселя, узел — в четыре.
 */
function drawThinRibbon(
  g: CanvasRenderingContext2D,
  mask: number,
  cx: number,
  cy: number,
  rPix: number,
): void {
  g.save();
  g.strokeStyle = COLOR.road;
  g.fillStyle = COLOR.road;
  g.lineWidth = MIN_RIBBON_PX;
  g.lineCap = "butt";
  for (let i = 0; i < ROAD_DIRS.length; i++) {
    if ((mask & (1 << i)) === 0) continue;
    const d = ROAD_DIRS[i];
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + (rPix * Math.sqrt(3) * (d.q + d.r / 2)) / 2, cy + (rPix * 1.5 * d.r) / 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(cx, cy, MIN_RIBBON_PX / 2, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
