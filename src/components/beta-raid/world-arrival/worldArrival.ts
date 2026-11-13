// A confirmed portal result identifies the actual destination, including random exits.
export const WORLD_ARRIVAL_MS = 1200;
const MAX_NAME_WAIT_MS = 5000;
type Name = { mapId: string; worldName: string | null } | null;
type ArrivalPorts = {
  read: (mapId: string) => Promise<Name>;
  show: (worldName: string) => () => void;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  cancel?: (id: ReturnType<typeof setTimeout>) => void;
};

export function createWorldArrival(ports: ArrivalPorts) {
  const now = ports.now ?? Date.now;
  const schedule = ports.schedule ?? setTimeout;
  const cancel = ports.cancel ?? clearTimeout;
  let generation = 0;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let remove: (() => void) | undefined;
  function clear() {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    remove?.();
    remove = undefined;
  }
  return {
    async arrive(mapId: string | null) {
      const request = ++generation;
      clear();
      if (disposed || !mapId) return;
      const started = now();
      try {
        const data = await ports.read(mapId);
        const name = data?.worldName?.trim();
        if (disposed || request !== generation || now() - started > MAX_NAME_WAIT_MS ||
            data?.mapId !== mapId || !name) return;
        remove = ports.show(name);
        timer = schedule(clear, WORLD_ARRIVAL_MS);
      } catch {
        // A missing caption must never turn successful paid travel into an error.
      }
    },
    dispose() {
      disposed = true;
      generation++;
      clear();
    },
  };
}

const listeners = new Set<(mapId: string | null) => void>();
export function announceWorldArrival(mapId: string | null) {
  for (const listener of listeners) listener(mapId);
}
export function subscribeWorldArrival(listener: (mapId: string | null) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
