// Какую карту редактор открывает при входе. По умолчанию — живую (активную):
// админ ждёт увидеть то, что строил в игре. Ссылка «Открыть» из генератора
// миров ведёт на /admin/hex-editor?map=<id> — тогда открывается эта карта
// (черновик), а живая остаётся как была.
const MAP_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Карта из адреса (?map=…), если она там есть и похожа на id карты. */
export function mapFromUrl(search: string): string | null {
  const id = new URLSearchParams(search).get("map");
  return id !== null && MAP_ID_RE.test(id) ? id : null;
}

export async function bootMapId(
  active: () => Promise<{ mapId: string | null }>,
): Promise<string | null> {
  const fromUrl = typeof window === "undefined" ? null : mapFromUrl(window.location.search);
  return fromUrl ?? (await active()).mapId;
}
