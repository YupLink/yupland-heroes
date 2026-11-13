// Сундук на клетке: картинка, флажок «свой/чужой» и босс-охранник. Обычный
// сундук (lib/plainChest) — той же картинкой товара, без флажка и без охраны.
//
// Сундук — не постройка карты, а свой слой (getMagicChests), поэтому
// drawBuilding о нём не знает: и флажок, и охранника на клетке без постройки
// рисуем здесь, в том же виде, что у шахты. Флажки шахт не трогаем — у сундука
// свой, поменьше: рядом с шахтой он не должен спорить с ней ростом.
//
// Правила кадра (ПРАВИЛА §9): без shadowBlur и save/restore — картинки кругом
// режутся один раз при выпечке спрайта, а не на каждой клетке.
import { R } from "@/components/beta-raid/hexGeometry";
import { flagCacheKey } from "@/lib/gameArt";
import type { DrawScene } from "@/components/beta-raid/betaCanvasScene";
import type { SceneCell } from "@/components/beta-raid/mapIndex";
import { SPRITE_MAX_BUCKET } from "@/components/beta-raid/drawObject";
import type { ChestMark } from "@/lib/magicChest";
import { guardImageKey } from "@/components/beta-raid/mine/guardArt";

/** Ниже этого зума деталей не видно: сундук — цветной квадрат (ПРАВИЛА §9.2). */
export const CHEST_LOD_SCALE = 0.5;
/** Ширина картинки сундука в мировых единицах: меньше постройки (R × 1.7). */
const CHEST_W = R * 1.25;
const OWN = "#37d67a";
const ENEMY = "#ff5470";
const CHEST_FILL = "#b9832b";
/** Обычный сундук (без хозяина): деревянный квадрат с тёмной рамкой, без флажка. */
const PLAIN_FILL = "#8a6a3c";
const PLAIN_EDGE = "#2e1b0c";

/**
 * Сундук на клетке. withGuard — рисовать ли охранника: на клетке с постройкой
 * его уже нарисовал drawBuilding (он берёт охрану по ключу клетки). Возвращает
 * верх картинки — к нему кадр цепляет флажок лагеря.
 */
export function drawMagicChest(
  scene: DrawScene,
  c: SceneCell,
  mark: ChestMark,
  withGuard: boolean,
): number {
  const { g } = scene;
  const bottom = c.y + R * 0.5;
  if (scene.scale < CHEST_LOD_SCALE) {
    // Издалека — квадрат цвета сундука с рамкой цвета хозяина: видно всегда.
    const s = R * 0.8;
    g.fillStyle = mark.plain ? PLAIN_FILL : CHEST_FILL;
    g.fillRect(c.x - s / 2, c.y - s / 2, s, s);
    g.strokeStyle = mark.plain ? PLAIN_EDGE : mark.mine ? OWN : ENEMY;
    g.lineWidth = R * 0.16;
    g.strokeRect(c.x - s / 2, c.y - s / 2, s, s);
    return c.y - s / 2;
  }
  const img = mark.image ? scene.images.get("mc:" + mark.image) : undefined;
  const ready = !!img && img.complete && img.naturalWidth > 0;
  const h = ready ? CHEST_W * (img.naturalHeight / img.naturalWidth) : CHEST_W * 0.75;
  const top = bottom - h;
  // Флажок ДО сундука: древко уходит за крышку, как у шахты. У обычного
  // сундука хозяина нет — и флажка нет.
  if (!mark.plain) drawChestFlag(scene, c.x, top, mark.mine);
  if (ready) {
    const sprites = scene.sprites;
    const sprite =
      sprites && scene.bucket <= SPRITE_MAX_BUCKET
        ? sprites.get(`mc:${mark.image}`, scene.bucket, CHEST_W, h, (sg, sw, sh) =>
            sg.drawImage(img, 0, 0, sw, sh),
          )
        : null;
    if (sprites && sprite) sprites.drawBottom(g, sprite, c.x, bottom, scene.bucket);
    else g.drawImage(img, c.x - CHEST_W / 2, top, CHEST_W, h);
  } else {
    // Картинка ещё едет — коробка цвета сундука, чтобы клетка не пустела.
    g.fillStyle = CHEST_FILL;
    g.fillRect(c.x - CHEST_W / 2, top, CHEST_W, h);
    g.strokeStyle = "#6b4a14";
    g.lineWidth = 1;
    g.strokeRect(c.x - CHEST_W / 2, top, CHEST_W, h);
  }
  // Охраны у обычного сундука не бывает — чужой охранник клетки не его.
  if (withGuard && !mark.plain) drawChestGuard(scene, c);
  return top;
}

/** Флажок хозяина: зелёный — мой сундук, красный — чужой. */
function drawChestFlag(scene: DrawScene, x: number, top: number, mine: boolean): void {
  const img = scene.images.get(flagCacheKey(mine ? "green" : "red"));
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const h = R * 0.75;
  const w = h * (img.naturalWidth / img.naturalHeight);
  scene.g.drawImage(img, x + CHEST_W * 0.08, top - h * 0.45, w, h);
}

/**
 * Охранник сундука: тот же кружок с красным кольцом, что у шахты (картинка —
 * по адресу, mine/guardArt, грузится с охраной шахт). Спрайт печём не выше
 * SPRITE_MAX_BUCKET: вблизи он чуть мягче, зато без обрезки кругом в кадре.
 */
function drawChestGuard(scene: DrawScene, c: SceneCell): void {
  const key = c.key;
  const guard = scene.mineGuards?.[key];
  if (!guard) return;
  const { g } = scene;
  const cx = c.x;
  const cy = c.y - R * 0.28;
  const rad = R * 0.46;
  const img = guard.image ? scene.images.get(guardImageKey(guard.image)) : undefined;
  if (img && img.complete && img.naturalWidth > 0 && scene.sprites) {
    const d = rad * 2 + 4;
    const bucket = Math.min(scene.bucket, SPRITE_MAX_BUCKET);
    const sprite = scene.sprites.get(
      `mcg:${key}:${guard.image}@${Math.round(d)}`,
      bucket,
      d,
      d,
      (sg, sw, sh) => {
        const x = sw / 2;
        const y = sh / 2;
        sg.save();
        sg.beginPath();
        sg.arc(x, y, rad, 0, Math.PI * 2);
        sg.clip();
        sg.drawImage(img, x - rad, y - rad, rad * 2, rad * 2);
        sg.restore();
        sg.beginPath();
        sg.arc(x, y, rad, 0, Math.PI * 2);
        sg.strokeStyle = ENEMY;
        sg.lineWidth = 2;
        sg.stroke();
      },
    );
    if (sprite) {
      scene.sprites.draw(g, sprite, cx, cy, scene.bucket);
      return;
    }
  }
  // Картинки нет или лимит выпечки кадра исчерпан — тёмный кружок с кольцом.
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.fillStyle = "#3a1220";
  g.fill();
  g.strokeStyle = ENEMY;
  g.lineWidth = 2;
  g.stroke();
}
