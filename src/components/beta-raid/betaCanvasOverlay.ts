import { heroActionFrame } from "./heroActionTiming";
import { drawActionAtlasFrame } from "./drawActionAtlasFrame";
import { beginHeroAction, getFishingIdleFrame, getHeroAction, interruptFishingIdle } from "./heroActionVisual";
import { drawStrikeTarget, type StrikeStore } from "./drawStrikeTarget";
// Фигуры поверх местности: замок, выбранная цель маршрута, доступные ходы
// и сам герой. Местность рисует betaCanvasDraw.
import { formatEnergyCost } from "@/lib/shipRules";
import { R, hexPath, hexPath2D } from "./hexGeometry";
import { COLOR, type DrawScene } from "./betaCanvasScene";

/** Красный «не дойти» — тот же, что у красных стрелок маршрута. */
const SHORT = "#d04646";

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

/**
 * Подсветка выбранной цели маршрута + цена в энергии. Энергии до цели не
 * хватает (reach < steps) — рамка красная и крестик, как в «Героях 3».
 */
export function drawPendingTarget(
  scene: DrawScene,
  target: { q: number; r: number; cost: number; steps?: number; reach?: number },
): void {
  const { g, toPixel } = scene;
  const p = toPixel(target.q, target.r);
  const short = target.reach != null && target.steps != null && target.reach < target.steps;
  const color = short ? SHORT : COLOR.gold;
  hexPath(g, p.x, p.y);
  g.fillStyle = short ? "rgba(208, 70, 70, 0.2)" : "rgba(245, 179, 1, 0.2)";
  g.fill();
  hexPath(g, p.x, p.y);
  g.strokeStyle = color;
  g.lineWidth = 3;
  g.stroke();
  if (short) {
    const d = R * 0.32;
    g.save();
    g.beginPath();
    g.moveTo(p.x - d, p.y - d);
    g.lineTo(p.x + d, p.y + d);
    g.moveTo(p.x + d, p.y - d);
    g.lineTo(p.x - d, p.y + d);
    g.lineWidth = Math.max(3, R * 0.12);
    g.lineCap = "round";
    g.stroke();
    g.restore();
  }
  g.fillStyle = color;
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
  heroVisual: { up: boolean; left: boolean; phase: number | null },
  store?: StrikeStore,
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
  if (onShip) { interruptFishingIdle(); return; }

  // An action uses the same map anchor as the mounted hero. Left-facing
  // frames are already mirrored in the exported PNGs.
  const visual = getHeroAction();
  const current = visual.action;
  if (heroVisual.phase !== null) interruptFishingIdle();
  if (!current && visual.fishingHold && heroVisual.phase === null) {
    const facing = visual.fishingFacing;
    const up = facing?.up ?? heroVisual.up;
    const left = facing?.left ?? heroVisual.left;
    const idleAtlas = images.get(`hero:fishing-idle:${up ? "back" : "front"}`);
    if (idleAtlas?.complete && idleAtlas.naturalWidth === 640 && idleAtlas.naturalHeight === 512) {
      const frame = getFishingIdleFrame(Date.now());
      if (frame) {
        const w = R * 2.1;
        const x = p.x - w / 2;
        const y = p.y + R * 0.5 - w;
        if (left) {
          g.save();
          g.translate(2 * p.x, 0);
          g.scale(-1, 1);
        }
        g.drawImage(idleAtlas, (frame.index % 5) * 128, Math.floor(frame.index / 5) * 128, 128, 128, x, y, w, w);
        if (left) g.restore();
        return;
      }
    }
  }
  const action = heroVisual.phase === null
    ? current?.kind ?? (visual.fishingHold ? "fishing-hold" : null)
    : null;
  if (action) {
    const target = current?.target ? toPixel(current.target.q, current.target.r) : null;
    // The server may remove the resource before the strike finishes; keep its
    // original art (at its map size) visible for the three-second visual.
    const hit = current?.target;
    if (hit?.decorId) drawStrikeTarget(scene, store, { ...hit, decorId: hit.decorId });
    const fishing = action === "fish" || action === "fishing-hold";
    const up = target ? target.y < p.y : fishing ? visual.fishingFacing?.up ?? heroVisual.up : heroVisual.up;
    const left = target ? target.x < p.x : fishing ? visual.fishingFacing?.left ?? heroVisual.left : heroVisual.left;
    const direction = `${left ? "left" : "right"}-${up ? "up" : "down"}`;
    const key = current ? `hero:action:${action}:${direction}` : `hero:hold:${direction}`;
    const image = images.get(key);
    if (image?.complete && image.naturalWidth >= (current ? 512 : 128) && image.naturalHeight >= 128) {
      if (current) beginHeroAction();
      const w = R * 2.1;
      const x = p.x - w / 2;
      const y = p.y + R * 0.5 - w;
      if (current) {
        const elapsed = Date.now() - (current.startedAt ?? Date.now());
        const frame = heroActionFrame(action, elapsed);
        drawActionAtlasFrame(g, image, images.get(`hero:action:${action}:right-${up ? "up" : "down"}`), frame, x, y, w);
      } else {
        g.drawImage(image, x, y, w, w);
      }
      return;
    }
    if (current) {
      const foot = images.get("hero:foot") ?? images.get("hero:gallop");
      if (foot?.complete && foot.naturalWidth >= 384 && foot.naturalHeight >= 384) {
        const w = R * 2.1;
        const x = p.x - w / 2;
        const y = p.y + R * 0.5 - w;
        const sx = up ? 0 : 128;
        if (left) {
          g.save();
          g.translate(2 * p.x, 0);
          g.scale(-1, 1);
        }
        g.drawImage(foot, sx, 256, 128, 128, x, y, w, w);
        if (left) g.restore();
        return;
      }
    }
  }

  // Атлас выбранного коня: нижний левый кадр — остановка спиной,
  // нижний средний — остановка лицом к игроку.
  const atlas = images.get("hero:gallop");
  const useAtlas = !!atlas?.complete && atlas.naturalWidth >= 384 && atlas.naturalHeight >= 384;
  const img = useAtlas ? atlas : images.get("hero");
  if (img && img.complete && img.naturalWidth > 0) {
    const w = R * 2.1;
    const h = useAtlas ? w : w * (img.naturalHeight / img.naturalWidth);
    // Якорь снизу — рыцарь «стоит» на клетке, крупнее гекса и выступает вверх.
    const x = p.x - w / 2;
    const y = p.y + R * 0.5 - h;
    const drawHero = () => {
      if (useAtlas) {
        const sx = heroVisual.phase == null ? (heroVisual.up ? 0 : 128) : heroVisual.phase * 128;
        const sy = heroVisual.phase == null ? 256 : (heroVisual.up ? 128 : 0);
        g.drawImage(img, sx, sy, 128, 128, x, y, w, h);
      } else {
        g.drawImage(img, x, y, w, h);
      }
    };
    if (heroVisual.left) {
      g.save();
      g.translate(2 * p.x, 0);
      g.scale(-1, 1);
      drawHero();
      g.restore();
    } else {
      drawHero();
    }
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


