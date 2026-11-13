// Общее у бесплатных генераторов лаборатории (§8.81): итог одного обращения
// и скачивание готовой картинки только с адреса самого генератора.

export type GenResult =
  | { kind: "ok"; image: Buffer }
  | { kind: "wait"; seconds: number; why: string }
  | { kind: "fail"; why: string };

export type Fetch = typeof fetch;

const MAX_BYTES = 8 * 1024 * 1024;

/** Картинка по адресу из ответа генератора. Чужой адрес не качаем (allowed —
 *  проверка адреса), пустое и огромное — брак, сбой сети — подождать. */
export async function downloadImage(
  url: string,
  allowed: (url: string) => boolean,
  f: Fetch,
  headers: Record<string, string> = {},
): Promise<GenResult> {
  if (!allowed(url)) return { kind: "fail", why: "foreign url" };
  // Без переходов: адрес проверен, а редирект увёл бы на непроверенный.
  const img = await f(url, { headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
  if (!img.ok) return { kind: "wait", seconds: 120, why: `image ${img.status}` };
  if (Number(img.headers.get("content-length")) > MAX_BYTES)
    return { kind: "fail", why: "bad size" };
  const image = Buffer.from(await img.arrayBuffer());
  if (image.length === 0 || image.length > MAX_BYTES) return { kind: "fail", why: "bad size" };
  return { kind: "ok", image };
}

export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
