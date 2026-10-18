// Чужие игроки на карте: лагерь с флагом и число человек в клетке.
//
// Лагерь ЗАМЕЩАЕТ содержимое клетки (объект/декор), чтобы картинки не лезли
// друг на друга; местность и дороги остаются на месте. Число рисуем всегда,
// даже когда игрок один, и всегда на тёмной плашке — иначе оно теряется на
// траве и на снегу.
//
// Исключение — постройки: их палатка закрывала целиком, и на карте пропадали
// шахты, лавки, порталы (жалоба владельца 06.09.2026). Там от лагеря остаётся
// только флажок сбоку и та же цифра, а само строение видно как обычно.
import { R } from "./hexGeometry";
import type { DrawScene } from "./betaCanvasScene";

const CAMP_W = R * 1.6;

export function drawPlayerCamp(scene: DrawScene, p: { x: number; y: number }, count: number): void {
  const { g, images } = scene;
  const img = images.get("camp");
  if (img && img.complete && img.naturalWidth > 0) {
    const h = CAMP_W * (img.naturalHeight / img.naturalWidth);
    // Якорь снизу: лагерь «стоит» на гексе и выступает вверх, как и герой.
    g.drawImage(img, p.x - CAMP_W / 2, p.y + R * 0.5 - h, CAMP_W, h);
  } else {
    g.beginPath();
    g.arc(p.x, p.y, R * 0.45, 0, Math.PI * 2);
    g.fillStyle = "#7f1d1d";
    g.fill();
  }
  drawPlayerCount(scene, p, count);
}

/** Плашка с числом игроков — читается поверх любой местности. */
export function drawPlayerCount(
  scene: DrawScene,
  p: { x: number; y: number },
  count: number,
): void {
  // LOD: при мелком зуме — цветная точка вместо текста.
  if (scene.scale < 0.5) {
    scene.g.beginPath();
    scene.g.arc(p.x + R * 0.45, p.y - R * 0.35, R * 0.2, 0, Math.PI * 2);
    scene.g.fillStyle = "#5ce0d8";
    scene.g.fill();
    return;
  }
  const { g } = scene;
  const text = String(count);
  const rr = R * 0.3;
  const cx = p.x + R * 0.45;
  const cy = p.y - R * 0.35;

  g.save();
  g.beginPath();
  g.arc(cx, cy, rr, 0, Math.PI * 2);
  g.fillStyle = "rgba(10, 13, 19, 0.92)";
  g.fill();
  g.strokeStyle = "#ff5470";
  g.lineWidth = 2;
  g.stroke();

  g.fillStyle = "#ffffff";
  g.font = `bold ${Math.round(R * 0.42)}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, cx, cy + 0.5);
  g.restore();
}

/**
 * Лагерь на клетке со строением: от арта берём только его верх — флаг с
 * древком (палатки остаются за кадром). Свой флажок лагеря, а не красный
 * значок шахты: два разных красных флага на одной клетке путали бы владение.
 * Слева, потому что справа флаг владения шахтой, а над крышей — счётчик поля.
 */
const FLAG_CROP = { x: 70, y: 0, w: 126, h: 128 };

export function drawCampFlag(
  scene: DrawScene,
  p: { x: number; y: number },
  buildingTop: number,
  buildingW: number,
): void {
  const img = scene.images.get("camp");
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const h = R * 0.9;
  const w = h * (FLAG_CROP.w / FLAG_CROP.h);
  scene.g.drawImage(
    img,
    FLAG_CROP.x,
    FLAG_CROP.y,
    FLAG_CROP.w,
    FLAG_CROP.h,
    p.x - buildingW * 0.5 - w * 0.1,
    buildingTop - h * 0.15,
    w,
    h,
  );
}
