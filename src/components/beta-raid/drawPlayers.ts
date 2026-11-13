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
//
// Онлайн (владелец, 09.11.2026): есть в клетке хоть один игрок в игре — лагерь
// анимированный (campOnline), а счёт — «онлайн/офлайн» через черту, как у кораблей.
import { R } from "./hexGeometry";
import type { DrawScene } from "./betaCanvasScene";
import { drawOnlineCamp } from "./campOnline";

const CAMP_W = R * 1.6;
type At = { x: number; y: number; key: string };

/** Сколько из `count` на клетке сейчас в игре. */
const onlineAt = (scene: DrawScene, p: At, count: number): number =>
  Math.min(count, scene.playersOnline?.get(p.key) ?? 0);

export function drawPlayerCamp(scene: DrawScene, p: At, count: number): void {
  const { g, images } = scene;
  const img = images.get("camp");
  if (onlineAt(scene, p, count) > 0 && drawOnlineCamp(scene, p.x, p.y + R * 0.5, CAMP_W)) {
    // Тот же размер и якорь, что у обычного лагеря.
  } else if (img && img.complete && img.naturalWidth > 0) {
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
export function drawPlayerCount(scene: DrawScene, p: At, count: number): void {
  const online = onlineAt(scene, p, count);
  // LOD: при мелком зуме — цветная точка вместо текста (онлайн — зелёная).
  if (scene.scale < 0.5) {
    scene.g.beginPath();
    scene.g.arc(p.x + R * 0.45, p.y - R * 0.35, R * 0.2, 0, Math.PI * 2);
    scene.g.fillStyle = online > 0 ? ONLINE : "#5ce0d8";
    scene.g.fill();
    return;
  }
  if (online > 0) return drawOnlineCount(scene, p, online, count - online);
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

const ONLINE = "#37d67a";
const OFFLINE = "#ececf5";

/** «онлайн/офлайн» на плашке: зелёным — кто в игре, светлым — остальные (как у кораблей). */
function drawOnlineCount(scene: DrawScene, p: At, online: number, offline: number): void {
  const { g } = scene;
  const parts = [{ text: String(online), color: ONLINE }];
  if (offline > 0) parts.push({ text: String(offline), color: OFFLINE });
  const rr = R * 0.3;
  const cx = p.x + R * 0.45;
  const cy = p.y - R * 0.35;
  g.save();
  g.font = `bold ${Math.round(R * 0.42)}px system-ui, sans-serif`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  const slash = g.measureText("/").width;
  const widths = parts.map((s) => g.measureText(s.text).width);
  const textW = widths.reduce((a, b) => a + b, 0) + slash * (parts.length - 1);
  const boxW = Math.max(rr * 2, textW + R * 0.3);
  g.beginPath();
  g.roundRect(cx - boxW / 2, cy - rr, boxW, rr * 2, rr);
  g.fillStyle = "rgba(10, 13, 19, 0.92)";
  g.fill();
  g.strokeStyle = ONLINE;
  g.lineWidth = 2;
  g.stroke();
  let x = cx - textW / 2;
  parts.forEach((part, i) => {
    if (i > 0) {
      g.fillStyle = "#9a9aab";
      g.fillText("/", x, cy + 0.5);
      x += slash;
    }
    g.fillStyle = part.color;
    g.fillText(part.text, x, cy + 0.5);
    x += widths[i];
  });
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
