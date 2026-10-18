// Постройка на клетке и всё, что к ней приклеено: флажок шахты, охранник,
// значок «занято/всего» у поля. Вынесено из betaCanvasDraw.ts (§13.1).
import { R } from "./hexGeometry";
import { flagCacheKey } from "@/lib/gameArt";
import type { DrawScene } from "./betaCanvasScene";
import { SPRITE_MAX_BUCKET } from "./drawObject";
import { drawWarehouseBadge } from "./drawWarehouseBadge";

import type { SceneCell } from "./mapIndex";

/** Бейдж — после тумана, если кадр ведёт очередь; иначе (нет очереди) сразу.
 *  В очередь кладём ключ и X, а не SceneCell: он один на кадр и к концу обхода
 *  указывал бы на последнюю клетку — бейджи уезжали в чужую клетку. */
function queueWarehouseBadge(scene: DrawScene, c: { key: string; x: number }, top: number): void {
  if (!scene.warehouseBadges?.[c.key]) return;
  if (scene.deferredBadges) scene.deferredBadges.push({ key: c.key, x: c.x, top });
  else drawWarehouseBadge(scene, c, top);
}

/**
 * Где рисовать картинку постройки, если не в своей клетке: объединённый блок
 * (drawMergedBlocks) даёт центр, «пол» и ширину на весь блок. Флажок шахты,
 * охранник, слоты и бейджи при этом тоже центрируются по блоку и растут с ним
 * (k = ширина блока / ширина одиночной) — как у постройки обычного размера.
 * Данные по-прежнему берутся по ключу ведущей клетки `c`.
 */
export type BuildingGeo = { cx: number; bottom: number; w: number };

/** Где стоит постройка на холсте: центр X, «центр клетки» Y, ключ и масштаб. */
type At = { key: string; x: number; y: number; k: number };

/** Постройка: облик берётся по её текущему тиру. Возвращает верх картинки. */
export function drawBuilding(
  scene: DrawScene,
  c: SceneCell,
  buildingId: string,
  geo?: BuildingGeo,
): number | null {
  const tier = scene.buildingTiers[c.key] ?? 0;
  const img = scene.images.get(`b:${buildingId}:${tier}`);
  const { g } = scene;
  const w = geo?.w ?? R * 1.7;
  const cx = geo?.cx ?? c.x;
  const bottom = geo?.bottom ?? c.y + R * 0.55;
  // Всё приклеенное к постройке (флаг, охранник, значки) — от той же точки и в
  // том же масштабе, что и картинка: у блока k > 1, у одиночной ровно 1.
  const k = geo ? w / (R * 1.7) : 1;
  const at: At = { key: c.key, x: cx, y: bottom - R * 0.55 * k, k };
  // LOD: картинка не загрузилась — рисуем цветной прямоугольник, чтобы
  // постройка не пропадала при отдалении или долгой загрузке.
  if (!img || !img.complete || img.naturalWidth === 0) {
    const h = w * 0.8;
    const top = bottom - h;
    g.fillStyle = "#3a3d4e";
    g.fillRect(cx - w / 2, top, w, h);
    g.strokeStyle = "#6b7280";
    g.lineWidth = 1;
    g.strokeRect(cx - w / 2, top, w, h);
    drawMineFlag(scene, at, top, w);
    queueWarehouseBadge(scene, at, top);
    return top;
  }
  const h = w * (img.naturalHeight / img.naturalWidth);
  const top = bottom - h;
  // Флаг рисуем ДО постройки: он стоит ЗА ней, и низ древка должен уходить за
  // крышу — так на образце от владельца. Поверх он выглядел приклеенным.
  drawMineFlag(scene, at, top, w);
  // Якорь снизу — постройка «стоит» на гексе и может выступать вверх.
  // Картинка — спрайтом под текущий зум (spriteCache), 1:1 на холст. Блок —
  // прямым drawImage: его ширина плавает с масштабом (шаг 5 %), и на каждую
  // ширину кэш пёк бы своего мастера на десятки мегабайт; блоков единицы.
  const sprite =
    !geo && scene.bucket <= SPRITE_MAX_BUCKET
      ? scene.sprites?.get(`b:${buildingId}:${tier}`, scene.bucket, w, h, (sg, sw, sh) =>
          sg.drawImage(img, 0, 0, sw, sh),
        )
      : null;
  if (sprite) scene.sprites!.drawBottom(g, sprite, cx, bottom, scene.bucket);
  else g.drawImage(img, cx - w / 2, top, w, h);
  drawMineGuard(scene, at);
  drawFieldSlots(scene, at, top);
  // Склад: «мои+общие» единицы товара к сбору — той же пилюлей, что у поля,
  // но поверх плёнки тумана (кадр рисует отложенные после drawCells).
  queueWarehouseBadge(scene, at, top);
  return top;
}

const FIELD_SLOT_FONT = `bold ${Math.round(R * 0.5)}px system-ui, sans-serif`;
/** Ширины меток значка кэшируем по «занято/всего»: measureText в кадре дорог. */
const fieldSlotWidths = new Map<string, { uw: number; slash: number; mw: number }>();

function slotMetrics(g: CanvasRenderingContext2D, used: string, max: string) {
  const key = used + "/" + max;
  let m = fieldSlotWidths.get(key);
  if (!m) {
    g.font = FIELD_SLOT_FONT;
    m = {
      uw: g.measureText(used).width,
      slash: g.measureText("/").width,
      mw: g.measureText(max).width,
    };
    fieldSlotWidths.set(key, m);
  }
  return m;
}

/**
 * Значок «занято/всего» героев над полем с лимитом. Первая цифра — ЗАНЯТО:
 * полно (занято ≥ всего) — красным, есть место — зелёным. Отдаёт только
 * лимитированные поля getFieldSlots.
 */
function drawFieldSlots(
  scene: DrawScene,
  c: { key: string; x: number },
  buildingTop: number,
): void {
  const fs = scene.fieldSlots?.[c.key];
  if (!fs) return;
  const { g } = scene;
  const full = fs.used >= fs.max;
  const used = String(fs.used);
  const max = String(fs.max);
  const { uw, slash, mw } = slotMetrics(g, used, max);
  g.save();
  g.font = FIELD_SLOT_FONT;
  g.textBaseline = "middle";
  const textW = uw + slash + mw;
  const y = buildingTop - R * 0.12;
  const padX = R * 0.22;
  g.fillStyle = "rgba(8, 11, 18, 0.82)";
  g.beginPath();
  g.roundRect(c.x - textW / 2 - padX, y - R * 0.28, textW + padX * 2, R * 0.56, R * 0.28);
  g.fill();
  g.textAlign = "left";
  const startX = c.x - textW / 2;
  g.fillStyle = full ? "#ff5470" : "#37d67a";
  g.fillText(used, startX, y);
  g.fillStyle = "#9a9aab";
  g.fillText("/", startX + uw, y);
  g.fillStyle = "#ececf5";
  g.fillText(max, startX + uw + slash, y);
  g.restore();
}

/**
 * Босс-охранник шахты поверх постройки. Живого охранника отдаёт getMineGuards
 * (только пока он жив), картинка загружена по ключу "mg:<q,r>". Кружок с
 * тревожным красным кольцом — сразу читается «шахту стерегут».
 */
function drawMineGuard(scene: DrawScene, c: At): void {
  if (!scene.mineGuards?.[c.key]) return;
  const { g } = scene;
  const img = scene.images.get("mg:" + c.key);
  // Чуть выше центра клетки — сидит на крыше/над шахтой, не заслоняя её низ.
  // У блока — по центру блока и в его масштабе (k), как у обычной шахты.
  const cx = c.x;
  const cy = c.y - R * 0.28 * c.k;
  const rad = R * 0.52 * c.k;
  if (img && img.complete && img.naturalWidth > 0) {
    // Иконка охранника с красным кольцом — спрайтом под зум, на любом отдалении.
    const d = rad * 2 + 4;
    const sprite =
      scene.bucket > SPRITE_MAX_BUCKET
        ? null
        : scene.sprites?.get(`mg:${c.key}@${Math.round(d)}`, scene.bucket, d, d, (sg, sw, sh) => {
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
            sg.strokeStyle = "#ff5470";
            sg.lineWidth = 2;
            sg.stroke();
          });
    if (sprite) {
      scene.sprites!.draw(g, sprite, cx, cy, scene.bucket);
      return;
    }
    g.save();
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.clip();
    g.drawImage(img, cx - rad, cy - rad, rad * 2, rad * 2);
    g.restore();
  } else {
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fillStyle = "#3a1220";
    g.fill();
  }
  g.beginPath();
  g.arc(cx, cy, rad, 0, Math.PI * 2);
  g.strokeStyle = "#ff5470";
  g.lineWidth = 2;
  g.stroke();
}

/**
 * Флажок захваченной шахты: зелёный — моя, красный — чужая.
 *
 * Держится ЗА постройкой и выступает над её крышей: так его видно и на
 * заставленной клетке, и при мелком зуме. Рисуем после самой постройки, но
 * смещаем выше её верхнего края — древко словно вкопано за домиком.
 *
 * На зону нажатия не влияет: тап считается по координатам гекса, а не по
 * нарисованному. Свободные шахты сервер не отдаёт вовсе — флага нет.
 */
function drawMineFlag(scene: DrawScene, c: At, buildingTop: number, buildingW: number): void {
  const flag = scene.mineFlags?.[c.key];
  if (!flag) return;
  // Три образа: свой зелёный на шахте, красный на чужой, «зелёное дерево» —
  // на использованном мной дереве уровней (и статуе) и на столбе заклинаний,
  // где выбранному герою больше нечего взять (useMapFlags). Значение приходит
  // с сервера (mine-flags.ts, spell-pillar-marks.ts), одна клетка — один
  // образ. Золотой точки «склад с моими вещами» больше нет: её место занял
  // бейдж с числами (drawWarehouseBadge).
  const color = flag === "own" ? "green" : flag === "tree" ? "green-tree" : "red";
  const img = scene.images.get(flagCacheKey(color));
  if (!img || !img.complete || img.naturalWidth === 0) return;
  const { g } = scene;

  // ⚠️ ФЛАЖКИ ШАХТ НЕ ТРОГАТЬ: их размер и положение владелец утвердил, любая
  // «мелкая правка» здесь ломает то, чем пользуются каждый день. Всё, что
  // просят про деревья, живёт в ветке ниже и на шахты не влияет.
  if (flag !== "tree") {
    // Ростом примерно с гекс: заметен издалека и не спорит с самой шахтой.
    // У блока — в масштабе блока (k), одиночная шахта — как утверждено (k = 1).
    const h = R * 1.05 * c.k;
    const w = h * (img.naturalWidth / img.naturalHeight);
    // Древко за правой частью крыши, полотнище уходит вверх и вправо; низ
    // древка прячется за постройкой, потому что она рисуется следом.
    g.drawImage(img, c.x + buildingW * 0.06, buildingTop - h * 0.42, w, h);
    return;
  }

  // Дерево уровней — свой флажок: крупнее вдвое с лишним (над лесом мелкий
  // терялся), по центру кроны, правее на 10% и опущен так, чтобы древко
  // уходило в ветви, а не висело в воздухе.
  const h = R * 2.31 * c.k;
  const w = h * (img.naturalWidth / img.naturalHeight);
  g.drawImage(img, c.x - w / 2 + w * 0.1, buildingTop - h * 0.55, w, h);
}
