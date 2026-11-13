// Иконка: 256×256 с палитрой (лёгкая), прозрачные края, тёмная обводка, брак — отказом.
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { gridStats, outline, pixelArt } from "./artPixel";

/** Белый холст 256×256 с «предметом»: тёмный контур и цветные полосы. */
async function sample(): Promise<Buffer> {
  const W = 256;
  const rgb = Buffer.alloc(W * W * 3, 255);
  for (let y = 60; y < 200; y++) {
    for (let x = 80; x < 180; x++) {
      const edge = x < 84 || x > 175 || y < 64 || y > 195;
      const c = edge ? [25, 20, 20] : [((x * 7) % 200) + 30, (y * 3) % 220, 90];
      rgb.set(c, (y * W + x) * 3);
    }
  }
  return sharp(rgb, { raw: { width: W, height: W, channels: 3 } })
    .png()
    .toBuffer();
}

describe("пиксель-иконка", () => {
  it("256×256 PNG легче 8 КБ, углы прозрачные, альфа только 0/255", async () => {
    const r = await pixelArt(await sample());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { data, info } = await sharp(r.png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([256, 256]);
    expect(r.png.length).toBeLessThan(8 * 1024);
    expect(data[3]).toBe(0);
    expect(data[(256 * 256 - 1) * 4 + 3]).toBe(0);
    const alphas = new Set<number>();
    for (let i = 3; i < data.length; i += 4) alphas.add(data[i]);
    expect([...alphas].sort()).toEqual([0, 255]);
    expect(r.cover).toBeGreaterThan(0.06);
  });

  it("пустая картинка — брак", async () => {
    const white = await sharp({
      create: { width: 64, height: 64, channels: 3, background: "#fff" },
    })
      .png()
      .toBuffer();
    expect(await pixelArt(white)).toEqual({ ok: false, why: "empty" });
    expect(await pixelArt(Buffer.from("not an image"))).toEqual({ ok: false, why: "decode" });
  });

  it("обводка ложится только снаружи, по 4 сторонам", () => {
    const size = 5;
    const px = Buffer.alloc(size * size * 4);
    px.set([200, 0, 0, 255], (2 * size + 2) * 4);
    const out = outline(px, size);
    expect(gridStats(out, size)).toEqual({ cover: 5 / 25, colors: 2 });
    expect(out[(1 * size + 1) * 4 + 3]).toBe(0); // диагональ — не контур
  });
});
