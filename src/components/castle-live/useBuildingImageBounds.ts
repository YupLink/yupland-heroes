import { useEffect, useState } from "react";
import { thumb } from "@/lib/image";
import type { Asset } from "@/components/castle-editor/types";

export type ImageBounds = { width: number; height: number; x0: number; y0: number; x1: number; y1: number };
const cache = new Map<string, Promise<ImageBounds | undefined>>();

function readBounds(url: string): Promise<ImageBounds | undefined> {
  let pending = cache.get(url);
  if (pending) return pending;
  pending = new Promise(resolve => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onerror = () => resolve(undefined);
    image.onload = () => {
      const width = image.naturalWidth, height = image.naturalHeight;
      if (!width || !height) { resolve(undefined); return; }
      const fallback = { width, height, x0: 0, y0: 0, x1: width, y1: height };
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) { resolve(fallback); return; }
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, width, height).data;
        let x0 = width, y0 = height, x1 = 0, y1 = 0;
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          if (pixels[(y * width + x) * 4 + 3] <= 16) continue;
          x0 = Math.min(x0, x); y0 = Math.min(y0, y);
          x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
        }
        resolve(x1 > x0 && y1 > y0 ? { width, height, x0, y0, x1, y1 } : fallback);
      } catch { resolve(fallback); }
    };
    image.src = url;
  });
  cache.set(url, pending);
  return pending;
}

export function useBuildingImageBounds(assets: Asset[]) {
  const [bounds, setBounds] = useState<Record<string, ImageBounds>>({});
  useEffect(() => {
    let active = true;
    void Promise.all(assets.filter(a => a.kind === "building" && a.image_url).map(async a => {
      const bound = await readBounds(thumb(a.image_url!, 512));
      return bound ? [a.id, bound] as const : undefined;
    })).then(entries => {
      if (active) setBounds(Object.fromEntries(entries.filter((entry): entry is readonly [string, ImageBounds] => !!entry)));
    });
    return () => { active = false; };
  }, [assets]);
  return bounds;
}
