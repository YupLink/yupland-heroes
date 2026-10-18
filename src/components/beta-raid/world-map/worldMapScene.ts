// Что стоит на карте мира в мировых координатах: метки, герой, замок, рамка —
// и что выбрал тап.
//
// Считается раз на ответ сервера и шаг героя, а не на кадр: кадр и жест берут
// готовые точки. Выключенные в легенде виды отсекает visibleScene — тоже не в
// кадре, а раз на тап по легенде.
import type { WorldMarkKind } from "@/lib/raid/worldMapCodec";
import {
  cellAt,
  cellWorld,
  KX,
  nearestTarget,
  type Box,
  type Cam,
  type Pt,
} from "./worldMapCamera";
import { cellValue, type WorldMapModel } from "./worldMapModel";
import type { WorldLayer } from "./worldMapLayers";

export type Cell = { q: number; r: number };
export type Target = Pt & Cell;
export type WorldScene = {
  /** Рамка мира: по ней вписывается и ограничивается камера. */
  box: Box;
  marks: Array<Target & { kind: WorldMarkKind }>;
  hero: Target | null;
  castle: Target | null;
  /** Куда «притягивается» тап: метки, замок, герой. */
  targets: Target[];
};

export const EMPTY_SCENE: WorldScene = {
  box: { x0: 0, y0: 0, x1: 1, y1: 1 },
  marks: [],
  hero: null,
  castle: null,
  targets: [],
};

/** Рамка, раздвинутая до точек (с запасом pad вокруг каждой). */
function grow(box: Box | null, pts: readonly Pt[], pad: number): Box {
  let b = box;
  for (const p of pts) {
    const x0 = p.x - pad;
    const y0 = p.y - pad;
    const x1 = p.x + pad;
    const y1 = p.y + pad;
    b = b
      ? {
          x0: Math.min(b.x0, x0),
          y0: Math.min(b.y0, y0),
          x1: Math.max(b.x1, x1),
          y1: Math.max(b.y1, y1),
        }
      : { x0, y0, x1, y1 };
  }
  return b ?? EMPTY_SCENE.box;
}

export function sceneOf(m: WorldMapModel, hero: Cell | null, castle: Cell): WorldScene {
  const at = (q: number, r: number): Target => ({ ...cellWorld(m, q, r), q, r });
  const marks = m.marks.map((k) => ({ ...at(k.q, k.r), kind: k.kind }));
  const heroT = hero ? at(hero.q, hero.r) : null;
  const castleT = at(castle.q, castle.r);
  const pts = heroT ? [castleT, heroT] : [castleT];
  // Клад бывает и вне разведанного (купол накрыл клетку позже) — рамка
  // обнимает и его, иначе камера не дала бы до него дотянуться. Пустая
  // разведка — рамка вокруг замка, героя и кладов, чтобы было что показать.
  const treasures = marks.filter((k) => k.kind === "treasure");
  const box =
    m.imgW > 0
      ? grow({ x0: 0, y0: 0, x1: m.imgW * KX, y1: m.imgH }, treasures, 0)
      : grow(null, [...pts, ...treasures], 6);
  return { box, marks, hero: heroT, castle: castleT, targets: [...marks, ...pts] };
}

/**
 * Сцена без выключенных в легенде видов: их не рисуем, и тап к ним не
 * притягивается. Рамка прежняя — камера от тапа по легенде не прыгает.
 */
export function visibleScene(s: WorldScene, hidden: ReadonlySet<WorldLayer>): WorldScene {
  if (hidden.size === 0) return s;
  const marks = s.marks.filter((k) => !hidden.has(k.kind));
  const castle = hidden.has("castle") ? null : s.castle;
  const hero = hidden.has("hero") ? null : s.hero;
  const pts = [castle, hero].filter((p): p is Target => p !== null);
  return { box: s.box, marks, hero, castle, targets: [...marks, ...pts] };
}

/**
 * Что выбрал тап: метка, замок или герой в пределах snapPx — их клетка; иначе
 * клетка под пальцем, если на ней есть местность. Тап в пустоту (неразведанное,
 * за краем карты) — null: камеру рейда в черноту не везём.
 */
export function pickCell(
  scene: WorldScene,
  m: WorldMapModel | null,
  cam: Cam,
  sx: number,
  sy: number,
  snapPx: number,
): Cell | null {
  const t = nearestTarget(cam, scene.targets, sx, sy, snapPx);
  if (t) return { q: t.q, r: t.r };
  if (!m) return null;
  const cell = cellAt(cam, m, sx, sy);
  return cellValue(m, cell.q, cell.r) ? cell : null;
}
