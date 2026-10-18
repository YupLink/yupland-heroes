// Купол глухого тумана — отдельным проходом ПОВЕРХ уже нарисованных клеток.
//
// Порядок важен по ТЗ: местность, дорога, декор, объект и постройка рисуются
// админу ровно как без купола, а сверху ложится дымка. Раньше зона рисовалась
// ВМЕСТО местности — под ней ничего не было видно, а покраска стирала клетку.
//
// Вызывается после drawCells и до замка с маршрутом: купол не должен замывать
// стрелки пути, кружки ходов, героя и золотую обводку невыгруженных правок.
import { hexPath2D } from "./hexGeometry";
import { forEachVisible, type MapIndex } from "./mapIndex";
import { VOID_DRAW_H, VOID_DRAW_W, voidTile } from "./voidTile";
import { VOID_DOME } from "@/lib/voidDome";
import type { DrawScene } from "./betaCanvasScene";

export function drawVoidDome(scene: DrawScene, index: MapIndex): void {
  const { g, seen, visible, voidCells, revealAll } = scene;
  // Купола на карте нет — второй проход по видимой полосе не начинаем вовсе.
  if (voidCells.size === 0) return;

  // Тайл и запасной контур берём один раз на кадр, а не на клетку.
  const tile = voidTile();
  const hex = tile ? null : hexPath2D();

  forEachVisible(index, scene.view, (c) => {
    if (!voidCells.has(c.key)) return;
    // Неразведанная клетка нарисована глухим гексом — купол поверх него лишний.
    // У игрока сюда не доходит ни одна клетка (зона вырезана из разведанного),
    // значит нарисованный купол означает «смотрит админ».
    if (!revealAll && !visible.has(c.i) && !seen.hasIndex(c.i)) return;
    g.translate(c.x, c.y);
    if (tile) {
      // Холст сдвинут в центр клетки — тайл симметричен, кладём вокруг нуля.
      g.drawImage(tile, -VOID_DRAW_W / 2, -VOID_DRAW_H / 2, VOID_DRAW_W, VOID_DRAW_H);
    } else if (hex) {
      // Тайла нет (нет DOM или контекста) — дымка с обводкой: без штриховки,
      // но зона всё равно читается как накрытая.
      g.fillStyle = VOID_DOME.veil;
      g.fill(hex);
      g.strokeStyle = VOID_DOME.edge;
      g.lineWidth = 1.5;
      g.stroke(hex);
    }
    g.translate(-c.x, -c.y);
  });
}
