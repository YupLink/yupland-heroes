import type {CSSProperties} from 'react';

const cache = new Map<string, CSSProperties>();

/** Fit the visible sprite, keeping transparent padding from making it look tiny. */
export function marketImageLayout(image: HTMLImageElement): CSSProperties {
  const key = image.currentSrc || image.src;
  if (/\.gif(?:[?&#]|$)/i.test(key)) return {};
  const known = cache.get(key);
  if (known) return known;
  let style: CSSProperties = {};
  try {
    const nw = image.naturalWidth, nh = image.naturalHeight;
    if (!nw || !nh) return style;
    const ratio = Math.min(1, 128 / Math.max(nw, nh));
    const canvas = document.createElement('canvas');
    const w = canvas.width = Math.max(1, Math.round(nw * ratio));
    const h = canvas.height = Math.max(1, Math.round(nh * ratio));
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return style;
    ctx.drawImage(image, 0, 0, w, h);
    const pixels = ctx.getImageData(0, 0, w, h).data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (pixels[(y * w + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x1 >= x0 && y1 >= y0) {
      // Pad the sampled bounds so small details and antialiased edges stay visible.
      x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1);
      x1 = Math.min(w, x1 + 2); y1 = Math.min(h, y1 + 2);
      const fw = Math.min(1, nw / nh), fh = Math.min(1, nh / nw);
      const extent = Math.max((x1 - x0) / w * fw, (y1 - y0) / h * fh);
      const scale = Math.max(1, Math.min(3, .94 / extent));
      const dx = -((x0 + x1) / (2 * w) - .5) * fw * scale * 100;
      const dy = -((y0 + y1) / (2 * h) - .5) * fh * scale * 100;
      style = {transform: `translate(${dx.toFixed(3)}%,${dy.toFixed(3)}%) scale(${scale.toFixed(3)})`, transformOrigin: 'center'};
    }
  } catch { /* External/tainted images retain the safe contain fallback. */ }
  if (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(key, style);
  return style;
}
