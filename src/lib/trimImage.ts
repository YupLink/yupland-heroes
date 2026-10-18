// Обрезка пустых полей картинки перед загрузкой.
//
// Художник отдаёт PNG с прозрачными полями по краям, и на гексе такая картинка
// «съёживается»: половина клетки уходит в пустоту. Раньше владелец обрезал
// каждый файл руками (заказ 10.09.2026 — делать это автоматически).
//
// Считаем границы непрозрачного (или не-белого, если альфы нет вовсе) и режем
// по ним. Само изображение не трогаем: ни масштаба, ни цветов — только поля.

/** Пиксель считается пустым, если он прозрачный или почти белый без альфы. */
const ALPHA_MIN = 8;
const WHITE_MIN = 250;

export type TrimResult = { blob: Blob; trimmed: boolean; width: number; height: number };

export async function trimTransparent(file: File | Blob, maxSide = 512): Promise<TrimResult> {
  const bitmap = await createImageBitmap(file);
  const { width: w, height: h } = bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return { blob: file, trimmed: false, width: w, height: h };
  g.drawImage(bitmap, 0, 0);

  const data = g.getImageData(0, 0, w, h).data;
  // Есть ли вообще альфа: у непрозрачного PNG режем по белым полям.
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  const filled = (x: number, y: number): boolean => {
    const i = (y * w + x) * 4;
    if (hasAlpha) return data[i + 3] >= ALPHA_MIN;
    return !(data[i] >= WHITE_MIN && data[i + 1] >= WHITE_MIN && data[i + 2] >= WHITE_MIN);
  };

  let top = 0;
  let bottom = h - 1;
  let left = 0;
  let right = w - 1;
  const rowEmpty = (y: number) => {
    for (let x = 0; x < w; x++) if (filled(x, y)) return false;
    return true;
  };
  const colEmpty = (x: number) => {
    for (let y = top; y <= bottom; y++) if (filled(x, y)) return false;
    return true;
  };
  while (top < bottom && rowEmpty(top)) top++;
  while (bottom > top && rowEmpty(bottom)) bottom--;
  while (left < right && colEmpty(left)) left++;
  while (right > left && colEmpty(right)) right--;

  const cw = right - left + 1;
  const ch = bottom - top + 1;
  const trimmed = cw < w || ch < h;
  // Заодно ужимаем до разумной стороны: на гексе картинка занимает под сотню
  // пикселей, а художник отдаёт 1024 — это вес каждой клетки в кадре.
  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const outW = Math.max(1, Math.round(cw * scale));
  const outH = Math.max(1, Math.round(ch * scale));
  if (!trimmed && scale === 1) {
    return { blob: file, trimmed: false, width: w, height: h };
  }

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const og = out.getContext("2d");
  if (!og) return { blob: file, trimmed: false, width: w, height: h };
  og.imageSmoothingEnabled = true;
  og.drawImage(canvas, left, top, cw, ch, 0, 0, outW, outH);
  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, "image/png"));
  return blob
    ? { blob, trimmed, width: outW, height: outH }
    : { blob: file, trimmed: false, width: w, height: h };
}

/** Загрузить картинку на сервер, обрезав поля. Возвращает публичный URL. */
export async function uploadTrimmed(file: File): Promise<string> {
  const { blob } = await trimTransparent(file);
  const fd = new FormData();
  fd.append("file", new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", {
    type: "image/png",
  }));
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const j = (await r.json()) as { url?: string; error?: string };
  if (!r.ok || !j.url) throw new Error(j.error || "не загрузилось");
  return j.url;
}
