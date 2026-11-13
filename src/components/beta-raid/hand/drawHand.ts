// Вещь в руке в кадре карты (handStore): круг досягаемости вокруг героя и отмеченные
// клетки. Круг не заслоняет землю — по ней ходят как раньше:
//  · земля: пустота, куда можно класть, — зелёная (иначе её не видно вовсе), своя земля
//    под перестройку — только жёлтый контур;
//  · динамит: то, что взорвётся, — зелёное, остальной круг — тонкий контур, город и
//    купол — красный контур;
//  · жила: клетки, что держат жилу, — зелёные, остальные клетки круга — красный
//    контур (пустоты, где клетки нет, не трогаем);
//  · отмеченные — золотом; у красного динамита — все семь клеток взрыва.
// Несколько заливок на кадр, без засветов.
import { R } from "../hexGeometry";
import { BUILD_COLOR } from "../mine-build/drawMineBuild";
import { blastCells, dynamiteKindOf } from "@/lib/dynamite";
import { getHand } from "./handStore";
import { handTakes } from "./handTap";

type Scene = {
  g: CanvasRenderingContext2D;
  scale: number;
  toPixel: (q: number, r: number) => { x: number; y: number };
};
type Hex = { q: number; r: number };

const REBUILD = "#f6c453";
const RING = "rgba(236, 236, 245, 0.45)";
const MARK = "#ffd166";
const MARK_FILL = "rgba(255, 209, 102, 0.42)";

const CORNERS: ReadonlyArray<readonly [number, number]> = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 180) * (60 * i - 30);
  return [R * 0.94 * Math.cos(a), R * 0.94 * Math.sin(a)] as const;
});

function paint(s: Scene, cells: readonly Hex[], fill: string | null, line: string, w = 1.5): void {
  if (cells.length === 0) return;
  const { g } = s;
  g.beginPath();
  for (const c of cells) {
    const p = s.toPixel(c.q, c.r);
    g.moveTo(p.x + CORNERS[0][0], p.y + CORNERS[0][1]);
    for (let i = 1; i < 6; i++) g.lineTo(p.x + CORNERS[i][0], p.y + CORNERS[i][1]);
    g.closePath();
  }
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  g.strokeStyle = line;
  g.lineWidth = Math.max(w, w / s.scale);
  g.stroke();
}

export function drawHand(s: Scene): void {
  const hand = getHand();
  const cells = hand?.cells;
  if (!hand || !cells?.length) return;
  const takes = cells.filter((c) => handTakes(hand, c));
  if (hand.kind === "vein" || hand.kind === "mushroom") {
    paint(
      s,
      cells.filter((c) => c.ok),
      BUILD_COLOR.okFill,
      BUILD_COLOR.ok,
    );
    paint(
      s,
      cells.filter((c) => !c.ok && c.reason !== "vein.no_cell"),
      null,
      BUILD_COLOR.bad,
      1,
    );
  } else if (hand.kind === "land") {
    paint(s, takes, BUILD_COLOR.okFill, BUILD_COLOR.ok);
    paint(
      s,
      cells.filter((c) => c.ok && c.cost > 0),
      null,
      REBUILD,
    );
  } else {
    paint(
      s,
      cells.filter((c) => c.ok && !handTakes(hand, c)),
      null,
      RING,
      1,
    );
    paint(s, takes, BUILD_COLOR.okFill, BUILD_COLOR.ok);
    paint(
      s,
      cells.filter((c) => !c.ok && c.reason !== "dynamite.no_cell"),
      null,
      BUILD_COLOR.bad,
      1,
    );
  }
  if (!hand.marks.length) return;
  const kind = hand.kind === "dynamite" ? dynamiteKindOf(hand.stackKey) : null;
  if (kind === "red")
    paint(
      s,
      hand.marks.flatMap((m) => blastCells(m, "red")),
      null,
      MARK,
      1,
    );
  paint(s, hand.marks, MARK_FILL, MARK, 2.5);
}
