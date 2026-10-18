// Подмены модулей для тестов вклада в магический сундук (chest-store*.test)
// поверх фейка chestStoreFake: кто кладёт (хозяин или чужой), вход, рюкзак,
// журнал и «подойди» по сундуку фейка (cs.chest, cs.guard). race — чужое дело
// между проверкой ручки и оператором вклада: поставили охрану, закопали,
// забрали сундук.
// В тесте: vi.mock("<модуль>", async () => (await import("@/test/chestStoreMocks")).<имя>).
import { cs } from "@/test/chestStoreFake";

export const st = {
  account: "acc_o",
  hero: "h1",
  pass: true,
  notes: [] as Array<Record<string, unknown>>,
  race: null as null | (() => void),
};

export function resetStoreMocks(): void {
  Object.assign(st, { account: "acc_o", hero: "h1", pass: true, notes: [], race: null });
}

export const startFn = {
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
};

export const passMod = {
  requirePass: async () => {
    if (!st.pass) throw new Error("pass.closed");
  },
};

export const backpack = {
  resolveBackpack: async () => {
    // Проверки ручки прошли, оператора ещё не было — тут и вклинивается чужое дело.
    const race = st.race;
    st.race = null;
    race?.();
    return { heroId: st.hero, capacity: 10, potionCapacity: 0 };
  },
};

export const note = { noteChestMove: (o: Record<string, unknown>) => void st.notes.push(o) };

/** Как chestNearAny: закопанный — своему «закопан», чужому «нет»; чужой при живой охране — бой. */
export const row = {
  chestActor: async () => ({ wallet: "w1", mapId: "rmap_x", account: st.account }),
  chestNearAny: async (a: { account: string }) => {
    const c = cs.chest;
    const mine = !!c && c.owner === a.account;
    if (!c || (c.buried && !mine)) throw new Error("chest.gone");
    if (c.buried) throw new Error("chest.buried");
    if (!mine && cs.guard) throw new Error("chest.guarded");
    return { chest: { owner_account: c.owner }, mine };
  },
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
  num: (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0),
};
