// Бейдж над складом: сколько ЕДИНИЦ товара лежит (с дробью) — моих (золотым) и на
// общей полке (белым). Пилюля та же, что у значка «занято/всего» над полем
// (drawBuilding): тёмная подложка, жирный шрифт R·0,5, над крышей постройки.
// Без свечений. Рисуется ПОВЕРХ плёнки тумана (кадр откладывает бейджи до
// конца drawCells): владелец просил, чтобы число к сбору читалось издалека;
// bright-зоны у складов нет — яркое кольцо r=1 красило чужие поля (21.09).
//
// Формат «2+3», а не «2/3»: рядом у полей «занято/всего», и дробь читалась бы
// как лимит. Нулевую сторону не пишем («2» или «3»), обе нули — бейджа нет.
import { R } from "./hexGeometry";
import { formatQty } from "@/lib/formatQty";
import type { DrawScene } from "./betaCanvasScene";

/** Где рисовать: ключ клетки (для данных) и её мировой X. Не SceneCell —
 *  тот один на кадр и перезаписывается на каждой клетке (forEachVisible). */
export type BadgeAt = { key: string; x: number };

const FONT = `bold ${Math.round(R * 0.5)}px system-ui, sans-serif`;
const OWN_COLOR = "#f5c451";
const PLUS_COLOR = "#9a9aab";
const SHARED_COLOR = "#ececf5";

/** Ширины частей по строке «own+shared»: measureText в кадре дорог. */
const widths = new Map<string, { ow: number; pw: number; sw: number }>();

function metrics(g: CanvasRenderingContext2D, own: string, plus: string, shared: string) {
  const key = own + plus + shared;
  let m = widths.get(key);
  if (!m) {
    g.font = FONT;
    m = {
      ow: g.measureText(own).width,
      pw: g.measureText(plus).width,
      sw: g.measureText(shared).width,
    };
    widths.set(key, m);
  }
  return m;
}

export function drawWarehouseBadge(scene: DrawScene, c: BadgeAt, buildingTop: number): void {
  const b = scene.warehouseBadges?.[c.key];
  if (!b || b.own + b.shared <= 0) return;
  const { g } = scene;
  // Дробь печатаем как есть («0.04»): ячейка занята, и игрок должен это видеть.
  const own = b.own > 0 ? formatQty(b.own) : "";
  const shared = b.shared > 0 ? formatQty(b.shared) : "";
  const plus = own && shared ? "+" : "";
  const { ow, pw, sw } = metrics(g, own, plus, shared);
  const textW = ow + pw + sw;
  const y = buildingTop - R * 0.12;
  const padX = R * 0.22;
  g.save();
  g.font = FONT;
  g.textBaseline = "middle";
  g.fillStyle = "rgba(8, 11, 18, 0.82)";
  g.beginPath();
  g.roundRect(c.x - textW / 2 - padX, y - R * 0.28, textW + padX * 2, R * 0.56, R * 0.28);
  g.fill();
  g.textAlign = "left";
  const startX = c.x - textW / 2;
  if (own) {
    g.fillStyle = OWN_COLOR;
    g.fillText(own, startX, y);
  }
  if (plus) {
    g.fillStyle = PLUS_COLOR;
    g.fillText(plus, startX + ow, y);
  }
  if (shared) {
    g.fillStyle = SHARED_COLOR;
    g.fillText(shared, startX + ow + pw, y);
  }
  g.restore();
}
