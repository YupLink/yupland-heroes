// Купол глухого тумана в гекс-редакторе — накладка поверх готовой клетки.
//
// Тот же рисунок, что и на карте рейда (lib/voidDome): дымка, диагональная
// штриховка, обводка гекса. Но печь его в тайл, как там, здесь нельзя: в игре
// радиус гекса — константа, а в редакторе он плавает от зума, и заранее
// испечённая картинка размывалась бы при каждом приближении.
//
// Рисуется ПОСЛЕ местности, дорог, декора и объектов: купол ничего под собой
// не прячет и не переписывает — админ обязан видеть сквозь него всё, что видел
// без него.
import { VOID_DOME } from "@/lib/voidDome";
import { hexPath } from "./hexShared";

export function drawVoidDome(g: CanvasRenderingContext2D, cx: number, cy: number, R: number): void {
  g.save();
  hexPath(g, cx, cy, R);
  g.fillStyle = VOID_DOME.veil;
  g.fill();
  // Штриховка живёт внутри гекса: без clip диагонали вылезали бы на соседей и
  // зона расползалась бы шире, чем накрыта на самом деле.
  g.clip();
  g.strokeStyle = VOID_DOME.hatch;
  g.lineWidth = 1.5;
  g.beginPath();
  // Шаг штриховки — доля радиуса, а не константа: на дальнем зуме постоянный
  // шаг превращал бы клетку в сплошную заливку.
  const step = Math.max(4, R * 0.22);
  for (let d = -R * 2; d <= R * 2; d += step) {
    g.moveTo(cx + d, cy - R);
    g.lineTo(cx + d + R * 2, cy + R);
  }
  g.stroke();
  g.restore();

  hexPath(g, cx, cy, R);
  g.strokeStyle = VOID_DOME.edge;
  g.lineWidth = 1.5;
  g.stroke();
}
