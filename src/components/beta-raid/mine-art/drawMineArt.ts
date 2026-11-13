// Картинки набора Ангелины на карте (lib/mineArt): прямоугольник картинки от
// прямоугольника постройки и «разрушено» вместо обычной у сломанной шахты.
//
// Сломана — шахта v2, чья жизнь действительно кончилась (mineBarWrecked): срок
// вышел по часам сервера или ничья ПОСЛЕ поломки. Ничья с рождения (остров
// новичка до починки, новая карта) — обычной картинкой. Картинку меняем только у четырёх шаблонов набора (лесопилка,
// каменная, золотая, алмазная — MINE_PLACE_BUILDING); прочие шахты (энерго,
// облики, грибы) рисуются как раньше. Флажка и охраны у сломанной нет (§8.59
// п. 4–5) — их не рисуем; полоса службы остаётся на своём месте.
import { R } from "../hexGeometry";
import { SPRITE_MAX_BUCKET } from "../drawObject";
import { queueMineLifeBar } from "../mine-life/drawMineLifeBars";
import { getMineBars, mineBarsNow } from "../mine-life/mineLifeStore";
import type { DrawScene } from "../betaCanvasScene";
import { MINE_PLACE_BUILDING } from "@/lib/minePlacement";
import { mineBarWrecked } from "@/lib/mineLifeBars";
import {
  MINE_ART_PAD_B,
  MINE_ART_PAD_T,
  MINE_ART_PAD_X,
  mineArtKey,
  type MineArtKind,
} from "@/lib/mineArt";

/** Ширина обычной постройки на клетке (drawBuilding). */
export const MINE_ART_W = R * 1.7;

/** Шаблон постройки → вид шахты набора. */
const KIND_BY_BUILDING = new Map<string, MineArtKind>(
  (Object.entries(MINE_PLACE_BUILDING) as Array<[MineArtKind, string]>).map(([k, id]) => [id, k]),
);
export const mineArtKindOfBuilding = (buildingId: string): MineArtKind | null =>
  KIND_BY_BUILDING.get(buildingId) ?? null;

type Size = { naturalWidth: number; naturalHeight: number };
/** x, y, w, h — куда класть кадр набора; top — верх обычной картинки шахты. */
export type ArtRect = { x: number; y: number; w: number; h: number; top: number };

/**
 * Где лежит картинка набора: постройка шириной w стоит низом на bottom с
 * центром cx; кадр набора шире на поля с боков и выше/ниже на поля сверху и
 * снизу. Без полей кадр совпал бы с обычной картинкой шахты один в один.
 */
export function mineArtRect(img: Size, cx: number, bottom: number, w: number): ArtRect {
  const dw = w * (1 + 2 * MINE_ART_PAD_X);
  const dh = (dw * img.naturalHeight) / img.naturalWidth;
  const b = bottom + w * MINE_ART_PAD_B;
  const y = b - dh;
  return { x: cx - dw / 2, y, w: dw, h: dh, top: y + w * MINE_ART_PAD_T };
}

const ready = (img: HTMLImageElement | undefined): img is HTMLImageElement =>
  !!img && img.complete && img.naturalWidth > 0;

/** Шахта v2 на клетке «q,r» сломалась, отслужив срок (не ничья с рождения). */
export function mineBroken(key: string, deviceNow = Date.now()): boolean {
  const bar = getMineBars().get(key);
  return !!bar && mineBarWrecked(bar, mineBarsNow(deviceNow));
}

/** Где стоит постройка: ключ клетки, центр X, масштаб блока (как в drawBuilding). */
type At = { key: string; x: number; k: number };

/**
 * Сломанная шахта набора — картинкой «разрушено». Вернёт верх обычной
 * картинки (полоса службы встаёт туда же) или null — рисовать как обычно: не
 * шахта набора, не сломана или картинка ещё едет (тогда обычная, без мигания).
 * sprite — одиночная клетка: спрайтом под зум, как обычная постройка.
 */
export function drawBrokenMine(
  scene: DrawScene,
  at: At,
  buildingId: string,
  bottom: number,
  w: number,
  sprite: boolean,
): number | null {
  const kind = mineArtKindOfBuilding(buildingId);
  if (!kind || !mineBroken(at.key)) return null;
  const key = mineArtKey(kind, "destroyed");
  const img = scene.images.get(key); // первый запрос и запускает загрузку
  if (!ready(img)) return null;
  const r = mineArtRect(img, at.x, bottom, w);
  const sp =
    sprite && scene.bucket <= SPRITE_MAX_BUCKET
      ? scene.sprites?.get(key, scene.bucket, r.w, r.h, (sg, sw, sh) =>
          sg.drawImage(img, 0, 0, sw, sh),
        )
      : null;
  if (sp) scene.sprites!.drawBottom(scene.g, sp, at.x, r.y + r.h, scene.bucket);
  else scene.g.drawImage(img, r.x, r.y, r.w, r.h);
  queueMineLifeBar(scene, at, r.top);
  return r.top;
}
