// Отрисовка чисто визуального декора (дерево/куст) поверх местности.
// Вынесено из betaCanvasDraw.ts (§13.1) — не интерактивен, не участвует
// ни в бою, ни в движении, поэтому и рисуется отдельной простой функцией.
// Зовётся и из выпечки кусков (chunkLayer): декор статичен и печётся вместе
// с местностью — при отдалении это сотни drawImage за кадр, снятых с кадра.
import { R } from "./hexGeometry";
import type { DrawScene } from "./betaCanvasScene";

type DecorationImages = Map<string, HTMLImageElement> & {
  decorationOriginal?: (key: string) => HTMLImageElement | undefined;
};

/** A world skin changes pixels, not the original size or bottom anchor.
 * Wait for the original dimensions rather than bake a temporary square.
 * Both the direct renderer and chunk culling must use this geometry.
 */
export function decorationSprite(images: DecorationImages, id: string, width = R * 1.5) {
  const key = "d:" + id;
  const replacement = images.get(key);
  const original = images.decorationOriginal?.(key) ?? replacement;
  const ready = !!original && original.complete && original.naturalWidth > 0;
  return {
    image: ready ? replacement : original,
    height: ready ? width * original.naturalHeight / original.naturalWidth : 0,
  };
}

export function drawDecoration(
  scene: Pick<DrawScene, "g" | "images">,
  p: { x: number; y: number },
  decorationId: string,
  /** Ширина картинки; по умолчанию 1,5R. Блок (drawMergedBlocks) даёт свою. */
  width = R * 1.5,
): void {
  const { g, images } = scene;

  const { image: img, height: h } = decorationSprite(images, decorationId, width);
  // Картинка ещё не загрузилась — зелёная точка вместо дерева/куста.
  // Точка временная: id без записи в словаре (удалённый шаблон) игроку в
  // снимок не уезжает (server dead-decor), а битый адрес ругается в консоль
  // (useImageCache.onerror) — «немой» вечной точки без следа больше нет.
  if (!img || !img.complete || img.naturalWidth === 0) {
    g.beginPath();
    g.arc(p.x, p.y, R * 0.25, 0, Math.PI * 2);
    g.fillStyle = "#2d6a30";
    g.fill();
    return;
  }
  const w = width;
  // Якорь снизу — картинка «стоит» на гексе, может чуть выступать вверх.
  g.drawImage(img, p.x - w / 2, p.y + R * 0.55 - h, w, h);
}
