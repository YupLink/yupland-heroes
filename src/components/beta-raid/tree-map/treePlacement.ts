// Sequential tree planting. No server/economy rules live here: cells and stock
// are refreshed through the existing APIs. The lock is synchronous (not React state).
export type Hex = { q: number; r: number };
export type TreeItem = { stackKey: string; name: string; image: string | null };
export type TreeCell = Hex & { dq: number; dr: number; ok: boolean; reason: string | null };
export type TreeContext = Hex & { mapId: string; walking: boolean };
export type TreePhase = "loading" | "ready" | "planting" | "syncing" | "uncertain" | "error";
export type TreeState = {
  item: TreeItem; count: number | null; cells: TreeCell[]; phase: TreePhase;
  message: string | null; anchor: TreeContext | null;
};
export type TreePorts = {
  context: () => TreeContext | null;
  read: (key: string) => Promise<{ count: number; energy: number; cells: Omit<TreeCell, "q" | "r">[] }>;
  plant: (data: { stackKey: string; dq: number; dr: number; op: string }) => Promise<Hex>;
  sync: () => Promise<void>;
  op: () => string;
  ended: () => void;
  cost: number;
};
const same = (a: TreeContext | null, b: TreeContext | null) =>
  !!a && !!b && a.mapId === b.mapId && a.q === b.q && a.r === b.r && !a.walking && !b.walking;
const refusal = (error: unknown) => error instanceof Error && /^[a-z][a-z0-9]*\.[a-z0-9_]+(\||$)/i.test(error.message);
export function createTreePlacement() {
  let state: TreeState | null = null;
  let ports: TreePorts | null = null;
  let version = 0, energy = 0;
  let operation: { item: TreeItem; stackKey: string; dq: number; dr: number; op: string; at: TreeContext } | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(fn => fn());
  const set = (patch: Partial<TreeState>) => { if (state) { state = { ...state, ...patch }; emit(); } };
  const locked = () => !!state && ["planting", "syncing", "uncertain"].includes(state.phase);
  const stop = () => {
    if (state?.phase === "planting" || state?.phase === "syncing") return false;
    // Finishing hides the panel, but a lost response keeps its operation key.
    version++; state = null; emit(); return true;
  };
  const load = async (message: string | null = null) => {
    if (!state || !ports) return;
    const port = ports, item = state.item, at = port.context(), ticket = ++version;
    set({ phase: "loading", cells: [], anchor: null, message });
    if (!at || at.walking) return;
    try {
      const data = await port.read(item.stackKey);
      if (ticket !== version || !state) return;
      if (!same(at, port.context())) { void load(message); return; }
      if (data.count < 1) { stop(); port.ended(); return; }
      energy = data.energy;
      const cells = data.cells.map(c => ({ ...c, q: at.q + c.dq, r: at.r + c.dr }));
      set({ count: data.count, phase: "ready", anchor: at, cells,
        message: message ?? (energy < port.cost ? "energy" : cells.some(c => c.ok) ? null : "no_cells") });
    } catch (error) {
      if (ticket === version) set({ phase: "error", cells: [], message: refusal(error) ? (error as Error).message : "load_error" });
    }
  };
  const sync = async (message: string | null) => {
    const port = ports, ticket = version;
    if (!port || !state) return;
    set({ phase: "syncing", cells: [], message });
    try {
      await port.sync();
      if (ticket === version) await load(message);
    } catch {
      if (ticket === version) set({ phase: "error", cells: [], message: "sync_error" });
    }
  };
  const run = async () => {
    if (!operation || !ports || !state) return;
    const port = ports, op = operation, ticket = version;
    set({ phase: "planting", cells: [], message: null });
    try {
      const result = await port.plant({ stackKey: op.stackKey, dq: op.dq, dr: op.dr, op: op.op });
      if (ticket !== version) return;
      operation = null;
      const matched = result.q === op.at.q + op.dq && result.r === op.at.r + op.dr;
      await sync(matched ? null : "position_changed");
    } catch (error) {
      if (ticket !== version) return;
      if (refusal(error)) { operation = null; await sync((error as Error).message); }
      else set({ phase: "uncertain", cells: [], message: "uncertain" });
    }
  };
  return {
    get: () => state,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    attach: (next: TreePorts) => {
      ports = next;
      if (state && !operation) void load();
      // Deferred teardown tolerates React StrictMode's effect replay.
      return () => { queueMicrotask(() => {
        if (ports !== next) return;
        version++; state = null; ports = null; emit();
      }); };
    },
    start: (item: TreeItem) => {
      if (locked()) return false;
      version++;
      if (operation) {
        state = { item: operation.item, count: null, cells: [], phase: "uncertain", anchor: null, message: "uncertain" };
        emit(); return true;
      }
      state = { item, count: null, cells: [], phase: "loading", anchor: null, message: null };
      emit(); void load(); return true;
    },
    stop,
    contextChanged: () => { if (state && !locked()) void load(); },
    refresh: () => { if (state && !locked()) void load(); },
    retry: () => {
      if (state?.phase === "uncertain" && operation) {
        // Relative API: a retry must never rebase onto a different hero/map.
        if (same(operation.at, ports?.context() ?? null)) void run();
        else set({ message: "retry_moved" });
      } else if (state?.phase === "error") void sync(null);
    },
    finishWithoutRetry: async () => {
      if (state?.phase !== "uncertain" || !operation || !ports) return;
      const port = ports, op = operation, ticket = version;
      set({ phase: "syncing", message: null });
      try {
        // Refresh only. The original request may still finish; never replay it here.
        await port.sync();
        await port.read(op.stackKey);
        if (ticket !== version || operation !== op) return;
        operation = null; version++; state = null; emit();
      } catch {
        if (ticket === version && operation === op) set({ phase: "uncertain", message: "sync_error" });
      }
    },
    tap: (q: number, r: number) => {
      if (!state || !ports) return false;
      if (locked()) return true;
      if (state.phase !== "ready" || !same(state.anchor, ports.context())) return true;
      const cell = state.cells.find(c => c.q === q && c.r === r);
      if (!cell) return false; // Ordinary deliberate movement outside planting range.
      if (!cell.ok) { set({ message: cell.reason ?? "blocked" }); return true; }
      if (energy < ports.cost) { set({ message: "energy" }); return true; }
      operation = { item: state.item, stackKey: state.item.stackKey, dq: cell.dq, dr: cell.dr, op: ports.op(), at: state.anchor! };
      void run(); return true;
    },
  };
}
export const treePlacement = createTreePlacement();
