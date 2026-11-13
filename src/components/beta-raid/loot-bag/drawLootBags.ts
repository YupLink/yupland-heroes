// Мешочек и бугорок на карте (ПРАВИЛА §8.21): маленький спрайт в нижнем правом
// углу гекса — не закрывает то, что стоит на клетке (декор мог вернуться
// респавном), и сам за ним не прячется. Мешочек важнее бугорка: на клетке есть
// что забрать без лопаты. Больше одного на клетке — число.
//
// Слой идёт после клеток, рядом с бейджами складов — поверх плёнки тумана:
// мешочки видно во «втором обзоре» (круг активной зоны на разведанном), как
// бейдж склада. Правила кадра (ПРАВИЛА §9): без shadowBlur и свечений, спрайт
// печётся один раз под зум, без save/restore. Издалека (LOD) — квадрат цвета
// мешочка с обводкой: видно на любом зуме. Рыба от красного динамита (30.10.2026) —
// тот же мешочек, только спрайт рыбы (и синий квадрат издалека).
import { R } from "@/components/beta-raid/hexGeometry";
import type { DrawScene } from "@/components/beta-raid/betaCanvasScene";
import type { MapStore } from "@/components/beta-raid/mapStore";
import { SPRITE_MAX_BUCKET } from "@/components/beta-raid/drawObject";
import type { LootBagCell, LootBagMarks } from "@/lib/lootBag";

/** Ниже этого зума деталей не видно (ПРАВИЛА §9.2): квадрат вместо картинки. */
export const BAG_LOD_SCALE = 0.5;
const W = { bag: R * 0.8, mound: R * 0.95, fish: R * 0.9 };
const FILL = { bag: "#b27b3c", mound: "#7c5232", fish: "#3d6f9e" };
const EDGE = "#2e1b0c";
/** Где стоит значок: правее центра гекса, низом у нижнего края. */
const DX = R * 0.42;
const BOTTOM = R * 0.72;

/** Все мешочки слоя, попавшие в кадр и во «второй обзор». */
export function drawLootBags(
  scene: DrawScene,
  store: MapStore,
  marks: LootBagMarks | undefined,
): void {
  if (!marks) return;
  const v = scene.view;
  for (const key in marks) {
    const i = store.indexOfKey(key);
    if (i < 0) continue;
    // Слой приходит из «второго обзора»; не успевший перечитаться после шага
    // список в тёмном тумане и на неразведанном не рисуем. Мои бугорки (02.10)
    // видно и дальше — в их первом обзоре (bright, как у своих шахт).
    const zone = scene.fogZones;
    const lit = !!zone && (zone.active.has(i) || zone.bright.has(i));
    if (!scene.revealAll && !(lit && scene.seen.hasIndex(i))) continue;
    const x = store.geom.x[i];
    const y = store.geom.y[i];
    if (x < v.minX || x > v.maxX || y < v.minY || y > v.maxY) continue;
    drawOne(scene, x + DX, y + BOTTOM, marks[key]);
  }
}

function drawOne(scene: DrawScene, x: number, bottom: number, cell: LootBagCell): void {
  const { g } = scene;
  const kind = cell.buried ? "mound" : cell.fish ? "fish" : "bag";
  if (scene.scale < BAG_LOD_SCALE) {
    const s = R * 0.55;
    g.fillStyle = FILL[kind];
    g.fillRect(x - s / 2, bottom - s, s, s);
    g.strokeStyle = EDGE;
    g.lineWidth = R * 0.12;
    g.strokeRect(x - s / 2, bottom - s, s, s);
    return;
  }
  const w = W[kind];
  const img = scene.images.get(`loot-${kind}`);
  const ready = !!img && img.complete && img.naturalWidth > 0;
  const h = ready ? w * (img.naturalHeight / img.naturalWidth) : w * 0.7;
  const top = bottom - h;
  if (ready) {
    const sprites = scene.sprites;
    const sprite =
      sprites && scene.bucket <= SPRITE_MAX_BUCKET
        ? sprites.get(`loot-${kind}`, scene.bucket, w, h, (sg, sw, sh) =>
            sg.drawImage(img, 0, 0, sw, sh),
          )
        : null;
    if (sprites && sprite) sprites.drawBottom(g, sprite, x, bottom, scene.bucket);
    else g.drawImage(img, x - w / 2, top, w, h);
  } else {
    // Картинка ещё едет — фигура цвета мешочка, чтобы клетка не пустела.
    g.fillStyle = FILL[kind];
    g.fillRect(x - w / 2, top, w, h);
  }
  if (cell.n > 1) drawCount(scene, x + w * 0.45, top + R * 0.06, cell.n);
}

/** Сколько мешочков и бугорков на клетке — белое число в тёмном кружке. */
function drawCount(scene: DrawScene, cx: number, cy: number, n: number): void {
  const { g } = scene;
  const rr = R * 0.25;
  const [align, base] = [g.textAlign, g.textBaseline];
  g.beginPath();
  g.arc(cx, cy, rr, 0, Math.PI * 2);
  g.fillStyle = "rgba(10, 13, 19, 0.92)";
  g.fill();
  g.strokeStyle = FILL.bag;
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = `bold ${Math.round(R * 0.32)}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(n > 9 ? "9+" : String(n), cx, cy + 0.5);
  g.textAlign = align;
  g.textBaseline = base;
}
