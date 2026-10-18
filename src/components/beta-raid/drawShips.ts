// Корабли на воде: свободный, чужой, свой и разбитый.
//
// Четыре облика вместо подписи: пустая палуба — судно ждёт хозяина, красный
// флаг — на борту другой игрок, рыцарь у мачты — это твой корабль, рваный
// парус — запас хода кончился и нужны доски. Так же, как лагерь показывает
// чужака на суше.
//
// Под кораблём — полоска запаса хода: пока она есть, судно ходит; кончилась —
// довозит капитана до берега и встаёт до починки (см. lib/shipHealth.ts).
import { R } from "./hexGeometry";
import type { DrawScene } from "./betaCanvasScene";
import { shipArtSrc, bigShipArtSrc } from "@/lib/gameArt";

const SHIP_W = R * 1.7;
/** Большой корабль крупнее обычного — своим галеоном. */
const BIG_SHIP_W = R * 2.1;

export type ShipMark = {
  /** Сколько судов на клетке. */
  total: number;
  /** Сколько из них заняты игроками. */
  busy: number;
  /** Сколько ждут капитана. */
  free: number;
  /** Одно из них — под нашим героем. */
  mine: boolean;
  /** Есть ли на клетке БОЛЬШОЙ корабль — рисуем его артом. */
  big: boolean;
  /** Свободный целый большой — только он открывает маршруту океан. */
  freeBig?: boolean;
  /** МОЁ судно на клетке — большое (для океана и цены гребка). */
  mineBig: boolean;
  /** Сколько судов разбито: жизни кончились, экипаж сошёл. */
  broken: number;
  /** Запас хода видимого борта и его потолок — для полоски. */
  hp: number;
  hpMax: number;
};

/**
 * Какой облик показать. Свой корабль важнее всего — он же наша фигурка;
 * дальше свободный (видно, что причал открыт), и только потом чужой занятый.
 */
export function shipLook(ship: ShipMark): "mine" | "other" | "free" | "dead" {
  if (ship.mine) return "mine";
  if (ship.free > 0) return "free";
  if (ship.busy > 0) return "other";
  // Целых не осталось: показываем то, что есть на самом деле — разбитый борт.
  return ship.broken > 0 ? "dead" : "free";
}

export const shipImageSrc = (ship: ShipMark): string =>
  ship.big ? bigShipArtSrc(shipLook(ship)) : shipArtSrc(shipLook(ship));

const shipImageKey = (ship: ShipMark): string => `ship-${ship.big ? "big-" : ""}${shipLook(ship)}`;

export function drawShip(scene: DrawScene, p: { x: number; y: number }, ship: ShipMark): void {
  const { g } = scene;
  const img = scene.images.get(shipImageKey(ship));
  const w = ship.big ? BIG_SHIP_W : SHIP_W;
  if (img && img.complete && img.naturalWidth > 0) {
    const h = w * (img.naturalHeight / img.naturalWidth);
    // Якорь снизу — корабль «сидит» в гексе и выступает мачтой вверх.
    g.drawImage(img, p.x - w / 2, p.y + R * 0.5 - h, w, h);
  } else {
    g.beginPath();
    g.arc(p.x, p.y, R * 0.45, 0, Math.PI * 2);
    g.fillStyle = ship.mine ? "#4fd6e0" : ship.busy > 0 ? "#7f1d1d" : "#8a6a3a";
    g.fill();
  }
  drawHpBar(scene, p, ship, w);
  drawShipCount(scene, p, ship);
}

/**
 * Запас хода под кораблём: полоска и само число.
 *
 * Одной полоски было мало — «сколько осталось» по ней не прочитать, а решение
 * плыть дальше или чинить принимается именно по числу (заказ владельца
 * 08.09.2026). Цифру пишем над полоской с тёмной обводкой, чтобы читалась и на
 * воде, и на парусе; при отдалённой карте её прячем — там она превратилась бы
 * в кашу из сотен подписей.
 */
function drawHpBar(
  scene: DrawScene,
  p: { x: number; y: number },
  ship: ShipMark,
  shipW: number,
): void {
  if (ship.hpMax <= 0 || scene.scale < 0.4) return; // LOD: полоска < 2px невидима
  const { g } = scene;
  const ratio = Math.max(0, Math.min(1, ship.hp / ship.hpMax));
  const color = ratio > 0.5 ? "#37d67a" : ratio > 0.2 ? "#facc15" : "#ff5470";
  const w = shipW * 0.62;
  const h = Math.max(3, R * 0.13);
  const x = p.x - w / 2;
  const y = p.y + R * 0.3;

  g.save();
  g.fillStyle = "rgba(8, 11, 18, 0.75)";
  g.beginPath();
  g.roundRect(x - 1, y - 1, w + 2, h + 2, h);
  g.fill();
  if (ratio > 0) {
    g.fillStyle = color;
    g.beginPath();
    g.roundRect(x, y, Math.max(h, w * ratio), h, h);
    g.fill();
  } else {
    g.strokeStyle = "#ff5470";
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(x, y, w, h, h);
    g.stroke();
  }

  // Число — только на приближённой карте: при обзоре целиком подписи у сотни
  // причалов сливаются в шум, а полоска цветом всё равно всё говорит.
  if (scene.scale >= 0.6) {
    const text = String(Math.max(0, Math.round(ship.hp)));
    g.font = `bold ${Math.round(R * 0.42)}px system-ui, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "bottom";
    g.lineWidth = 3;
    g.strokeStyle = "rgba(8, 11, 18, 0.9)";
    g.strokeText(text, p.x, y - 1);
    g.fillStyle = ship.mine ? "#ffffff" : color;
    g.fillText(text, p.x, y - 1);
  }
  g.restore();
}

/**
 * Счёт судов на причале — по одному числу на состояние, каждое своим цветом:
 * зелёное — свободные, светлое — занятые, красное — разбитые. На одной клетке
 * уживаются все три, и по цвету сразу видно, есть ли на что сесть.
 */
function drawShipCount(scene: DrawScene, p: { x: number; y: number }, ship: ShipMark): void {
  // LOD: при мелком зуме — точка вместо текста.
  if (scene.scale < 0.5) {
    scene.g.beginPath();
    scene.g.arc(p.x, p.y + R * 0.66, R * 0.15, 0, Math.PI * 2);
    scene.g.fillStyle = ship.broken > 0 ? "#ff5470" : "#37d67a";
    scene.g.fill();
    return;
  }
  const parts: Array<{ text: string; color: string }> = [];
  if (ship.free > 0) parts.push({ text: String(ship.free), color: "#37d67a" });
  if (ship.busy > 0) parts.push({ text: String(ship.busy), color: "#ececf5" });
  if (ship.broken > 0) parts.push({ text: String(ship.broken), color: "#ff5470" });
  // Одинокое целое судно и так видно по арту — цифра нужна, когда их несколько
  // или когда среди них есть разбитое.
  if (parts.length === 0 || (ship.total <= 1 && ship.broken === 0)) return;

  const { g } = scene;
  g.save();
  g.font = `bold ${Math.round(R * 0.5)}px system-ui, sans-serif`;
  g.textBaseline = "middle";
  const slash = g.measureText("/").width;
  const widths = parts.map((s) => g.measureText(s.text).width);
  const textW = widths.reduce((a, b) => a + b, 0) + slash * (parts.length - 1);
  const boxW = textW + R * 0.4;
  const y = p.y + R * 0.66;
  g.fillStyle = "rgba(8, 11, 18, 0.82)";
  g.beginPath();
  g.roundRect(p.x - boxW / 2, y - R * 0.28, boxW, R * 0.56, R * 0.28);
  g.fill();

  g.textAlign = "left";
  let x = p.x - textW / 2;
  parts.forEach((part, i) => {
    if (i > 0) {
      g.fillStyle = "#9a9aab";
      g.fillText("/", x, y);
      x += slash;
    }
    g.fillStyle = part.color;
    g.fillText(part.text, x, y);
    x += widths[i];
  });
  g.restore();
}
