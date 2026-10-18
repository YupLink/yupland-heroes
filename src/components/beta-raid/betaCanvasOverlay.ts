// Фигуры поверх местности: замок, выбранная цель маршрута, доступные ходы
// и сам герой. Местность рисует betaCanvasDraw.
import { formatEnergyCost } from "@/lib/shipRules";
import { R, hexPath, hexPath2D } from "./hexGeometry";
import { COLOR, type DrawScene } from "./betaCanvasScene";

/**
 * Замок в центре карты — точка отсчёта и цель возврата.
 *
 * Рисуем присланной картинкой, а не фигурами: замок — такой же объект мира,
 * как рыцарь. Крупнее гекса примерно на треть и «стоит» на нём, слегка
 * выходя за грани, — на зону нажатия это не влияет: тап считается по
 * координатам гекса, а не по картинке.
 *
 * Картинки ещё нет (грузится) — остаётся прежний золотой гекс, чтобы центр
 * карты не пропадал на первых кадрах.
 */
export function drawCastle(scene: DrawScene, q: number, r: number): void {
  const { g, toPixel } = scene;
  const p = toPixel(q, r);
  const img = scene.images.get("castle");
  if (img && img.complete && img.naturalWidth > 0) {
    const size = R * 2 * 1.3;
    g.drawImage(img, p.x - size / 2, p.y - size / 2, size, size);
    return;
  }
  hexPath(g, p.x, p.y);
  g.fillStyle = COLOR.gold;
  g.fill();
  g.strokeStyle = COLOR.goldDeep;
  g.lineWidth = 2.5;
  g.stroke();
}

/** Цена шага на соседней клетке — тёмная плашка, чтобы читалась на любой местности. */
function drawStepCost(scene: DrawScene, p: { x: number; y: number }, cost: number): void {
  const { g } = scene;
  // Формат один на все места, где видна цена (метка маршрута, кнопка посадки).
  const text = formatEnergyCost(cost);
  // Плашка растёт под текст: со скидкой героя цена стала дробной («1.26»), и
  // в кружок постоянного размера четыре знака не влезали — на карте оставался
  // обрезок вроде «.26», по которому цену не прочитать.
  const wide = text.length > 2;
  const rr = R * (wide ? 0.44 : 0.3);
  const font = Math.round(R * (wide ? 0.3 : 0.38));
  g.save();
  g.beginPath();
  if (wide) {
    // Длинному числу — не круг, а таблетка: круг пришлось бы раздуть вдвое,
    // и соседние клетки слиплись бы.
    const h = R * 0.5;
    const w = rr * 2;
    g.roundRect(p.x - w / 2, p.y - h / 2, w, h, h / 2);
  } else {
    g.arc(p.x, p.y, rr, 0, Math.PI * 2);
  }
  g.fillStyle = "rgba(10, 13, 19, 0.88)";
  g.fill();
  g.strokeStyle = COLOR.route;
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = COLOR.gold;
  g.font = `bold ${font}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, p.x, p.y + 0.5);
  g.restore();
}

/** Подсветка выбранной цели маршрута + цена в энергии. */
export function drawPendingTarget(
  scene: DrawScene,
  target: { q: number; r: number; cost: number },
): void {
  const { g, toPixel } = scene;
  const p = toPixel(target.q, target.r);
  hexPath(g, p.x, p.y);
  g.fillStyle = "rgba(245, 179, 1, 0.2)";
  g.fill();
  hexPath(g, p.x, p.y);
  g.strokeStyle = COLOR.gold;
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = COLOR.gold;
  g.font = `bold ${Math.max(10, R * 0.4)}px system-ui`;
  g.textAlign = "center";
  g.textBaseline = "bottom";
  g.fillText(formatEnergyCost(target.cost), p.x, p.y - R * 0.7);
}

/** Цель шага острова: пунктирная рамка клетки поверх тумана, без заливки. */
export function drawGoalCell(scene: DrawScene, cell: { q: number; r: number }): void {
  const { g, toPixel } = scene;
  const p = toPixel(cell.q, cell.r);
  g.save();
  hexPath(g, p.x, p.y);
  g.setLineDash([R * 0.28, R * 0.18]);
  g.strokeStyle = COLOR.gold;
  g.lineWidth = 3;
  g.stroke();
  g.restore();
}

/**
 * Доступные ходы и фигурка героя.
 * Герой приходит уже в пикселях: между клетками он едет плавно, поэтому его
 * положение дробное и через q/r не выражается.
 */
export function drawMovesAndHero(
  scene: DrawScene,
  moves: Array<{ q: number; r: number; cost?: number }>,
  p: { x: number; y: number },
): void {
  const { g, toPixel, images } = scene;
  const hex = hexPath2D(); // кэшированный Path2D — один на все ходы
  for (const m of moves) {
    const mp = toPixel(m.q, m.r);
    g.translate(mp.x, mp.y);
    g.strokeStyle = COLOR.route;
    g.lineWidth = 2;
    g.stroke(hex);
    g.translate(-mp.x, -mp.y);
    // Цена шага прямо на клетке: раньше её было видно только у дальней цели.
    if (m.cost != null) drawStepCost(scene, mp, m.cost);
  }

  // Герой на своём корабле уже нарисован на палубе — вторая фигурка рядом
  // выглядела бы как два героя на одной клетке.
  const onShip = scene.heroCell && scene.ships.get(`${scene.heroCell.q},${scene.heroCell.r}`)?.mine;
  if (onShip) return;

  // Иконка героя (рыцарь на лошади). Если картинка ещё не загрузилась —
  // fallback на прежнюю точку, чтобы герой был виден сразу.
  const img = images.get("hero");
  if (img && img.complete && img.naturalWidth > 0) {
    const w = R * 2.1;
    const h = w * (img.naturalHeight / img.naturalWidth);
    // Якорь снизу — рыцарь «стоит» на клетке, крупнее гекса и выступает вверх.
    g.drawImage(img, p.x - w / 2, p.y + R * 0.5 - h, w, h);
    return;
  }
  g.beginPath();
  g.arc(p.x, p.y, R * 0.4, 0, Math.PI * 2);
  g.fillStyle = COLOR.hero;
  g.fill();
  g.strokeStyle = COLOR.dark;
  g.lineWidth = 2.5;
  g.stroke();
  g.beginPath();
  g.arc(p.x, p.y - R * 0.05, R * 0.14, 0, Math.PI * 2);
  g.fillStyle = COLOR.dark;
  g.fill();
}

/**
 * Невыгруженные правки админа — пунктирная золотая обводка поверх всего.
 * Рисуем последними: подсветка доступных ходов иначе перекрывает рамку, и
 * непонятно, что именно уедет по кнопке «Выгрузить».
 */
export function drawPendingEdits(scene: DrawScene, cells: Set<string>): void {
  if (cells.size === 0) return;
  const { g, toPixel } = scene;
  const hex = hexPath2D(); // кэшированный Path2D — один на все клетки
  g.save();
  g.strokeStyle = COLOR.gold;
  g.lineWidth = 2.5;
  g.setLineDash([R * 0.28, R * 0.18]);
  for (const key of cells) {
    const [q, r] = key.split(",").map(Number);
    if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
    const p = toPixel(q, r);
    g.translate(p.x, p.y);
    g.stroke(hex);
    g.translate(-p.x, -p.y);
  }
  g.restore();
}

/**
 * Выделение под биом-генератор — своя пунктирная обводка. Оттенок тот же
 * жёлтый, что и у правок, но шаг штриха мельче и линия тоньше: невыгруженные
 * правки читаются одним взглядом, а «выделено для генератора» — другим.
 */
export function drawGenSelected(scene: DrawScene, cells: Set<string>): void {
  if (cells.size === 0) return;
  const { g, toPixel } = scene;
  const hex = hexPath2D(); // кэшированный Path2D — один на все клетки
  g.save();
  g.strokeStyle = "#f6c453";
  g.lineWidth = 1.8;
  g.setLineDash([R * 0.16, R * 0.12]);
  for (const key of cells) {
    const [q, r] = key.split(",").map(Number);
    if (!Number.isFinite(q) || !Number.isFinite(r)) continue;
    const p = toPixel(q, r);
    g.translate(p.x, p.y);
    g.stroke(hex);
    g.translate(-p.x, -p.y);
  }
  g.restore();
}
