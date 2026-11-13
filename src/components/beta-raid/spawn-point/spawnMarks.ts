// Точки спавна на карте режима бога — мимо React, как полосы шахт (mineLifeStore):
// список кладёт useSpawnMarks, кадр карты рисует значки (drawSpawnPoints) и
// перерисовывается по подписке (useRedrawOnStores). null — значков нет.
export type SpawnMark = { q: number; r: number; radius: number };

let marks: SpawnMark[] | null = null;
let mapId: string | null = null;
const listeners = new Set<() => void>();

export const getSpawnMarks = (): { mapId: string | null; marks: SpawnMark[] | null } => ({
  mapId,
  marks,
});

export function setSpawnMarks(nextMap: string | null, next: SpawnMark[] | null): void {
  if (next === marks && nextMap === mapId) return;
  marks = next;
  mapId = nextMap;
  for (const fn of listeners) fn();
}

export function subscribeSpawnMarks(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
