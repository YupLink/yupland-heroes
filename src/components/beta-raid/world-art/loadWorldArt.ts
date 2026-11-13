/** Atomic layer loading: a missing asset returns null, never a partial art set. */
export function loadWorldArt(
  urls: Record<string,string>,
  createImage: () => HTMLImageElement = () => new Image(),
  timeoutMs = 15000,
) {
  let cancelled = false;
  const pending: Array<() => void> = [];
  const promise = Promise.all(Object.entries(urls).map(([key,url]) => new Promise<[string,HTMLImageElement] | null>(resolve => {
    const image = createImage();
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return; finished = true;
      clearTimeout(timer); image.onload = image.onerror = null;
      resolve(ok ? [key,image] : null);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(image.naturalWidth > 0);
    image.onerror = () => finish(false);
    pending.push(() => { if (!finished) { finish(false); image.src = ''; } });
    image.src = url;
  }))).then(results => cancelled || results.some(item => item === null)
    ? null : new Map(results as Array<[string,HTMLImageElement]>));
  return { promise, cancel: () => { cancelled = true; pending.forEach(stop => stop()); } };
}
