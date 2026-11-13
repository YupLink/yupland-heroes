// Лагерь игрока, который сейчас в игре (владелец, 09.11.2026: «анимация для лагеря
// пользователей онлайн… важно для PvP — легче найти тех, кто в игре»).
//
// Арт владельца: 8 кадров по 120 мс, флаг «online» колышется, костёр горит. В
// /raid-camp-online.webp кадры лежат в ряд, каждый обрезан до того же размера и
// пропорций, что и обычный лагерь (/raid-camp.webp), — меняется только картинка.
//
// Кадр карты спит, пока ничего не движется, поэтому лагерь сам просит следующую
// перерисовку (campOnlineDelay — как шаман и рыбалка). Мелкая карта, свёрнутое
// окно, «меньше движения» в системе — первый кадр без анимации и без будильника.
import type { DrawScene } from "./betaCanvasScene";

export const CAMP_ONLINE_KEY = "camp-online";
const FRAME_W = 160;
const FRAME_H = 209;
const FRAMES = 8;
const FRAME_MS = 120;
/** Ниже этого зума лагерь — пара десятков пикселей: огня не видно, а кадры стоят батареи. */
const ANIMATE_MIN_SCALE = 0.5;

let nextDelay: number | null = null;

/** Через сколько мс нужен следующий кадр ради лагерей онлайн (и сброс до следующего кадра). */
export function campOnlineDelay(): number | null {
  const d = nextDelay;
  nextDelay = null;
  return d;
}

function still(scene: DrawScene): boolean {
  if (scene.scale < ANIMATE_MIN_SCALE || typeof document === "undefined" || document.hidden)
    return true;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Нарисовать лагерь онлайн шириной `w`, низом на `bottom`. false — картинка ещё не
 * пришла (или не та): рисуем обычный лагерь.
 */
export function drawOnlineCamp(scene: DrawScene, cx: number, bottom: number, w: number): boolean {
  const img = scene.images.get(CAMP_ONLINE_KEY);
  if (!img || !img.complete || img.naturalWidth !== FRAME_W * FRAMES) return false;
  const now = Date.now();
  const frame = still(scene) ? 0 : Math.floor(now / FRAME_MS) % FRAMES;
  const h = w * (FRAME_H / FRAME_W);
  scene.g.drawImage(img, frame * FRAME_W, 0, FRAME_W, FRAME_H, cx - w / 2, bottom - h, w, h);
  if (!still(scene)) {
    const wait = Math.max(16, FRAME_MS - (now % FRAME_MS));
    nextDelay = Math.min(nextDelay ?? Infinity, wait);
  }
  return true;
}
