// Подмены модулей и набор вызовов для тестов рыбалки (fishing*.test) поверх
// фейка базы (fishing.fake): кто действует, где стоит, рюкзак, выдача улова
// (запись вызовов deliverOrDrop и «Добычи») и имена товаров.
// В тесте: vi.mock("<модуль>", async () => (await import("./fishing.fake-mocks")).<имя>).
// Модули рыбалки отсюда не импортировать: подмены берут этот файл из своих
// фабрик, и цикл «фабрика → этот файл → подменённый модуль» вешает загрузку.
import { fx, packOf, resetFx } from "./fishing.fake";

type Drop = { key: string; items: Array<{ itemId: string; amount: number; origin: unknown }> };

export const s = {
  /** Вызовы deliverOrDrop: ключ выпадения и предметы. */
  drops: [] as Drop[],
  /** Строки «Добычи»: ключ и сколько. */
  queued: [] as Array<{ key: string; amount: number }>,
  /** deliverOrDrop бросит (ничего не выдано). */
  dropFails: false,
};

export const startFn = {
  createServerFn: () => {
    let check: ((d: unknown) => unknown) | null = null;
    const fn = {
      inputValidator: (v: (d: unknown) => unknown) => ((check = v), fn),
      handler: (h: (a: { data: unknown }) => unknown) => (a?: { data?: unknown }) =>
        h({ data: check ? check(a?.data) : a?.data }),
    };
    return fn;
  },
};

export const mcp = {
  mcpExec: async (sql: string) => (await import("./fishing.fake")).fakeExec(sql),
};
export const gate = { requireBetaRaid: async () => "w1" };
export const move = { accAccountId: async () => "acc1" };
export const actor = {
  bagActor: async () => ({ wallet: "w1", mapId: "map1", account: "acc1" }),
};
export const backpack = {
  resolveBackpack: async () => (fx.selected.has("h1") ? { heroId: "h1" } : null),
};
export const where = {
  ownCell: async () => {
    const p = fx.pos.get("acc1");
    return p ? { q: p.q, r: p.r } : null;
  },
};
export const deliver = {
  queueKey: (key: string, i: number) => `${key}:q${i}`,
  deliverOrDrop: async (o: Drop & { at: { key: string }; items: Drop["items"] }) => {
    if (s.dropFails) throw new Error("loot-bag: hero unreadable");
    s.drops.push({ key: o.at.key, items: o.items });
    return { items: [], bagId: null };
  },
};
export const queue = {
  queueEncounterReward: async (r: { key: string; amount: number }) =>
    void s.queued.push({ key: r.key, amount: r.amount }),
};
export const alias = {
  canonCustomMeta: async (id: string) => ({ name: fx.catalog.get(id)?.name ?? id, image: null }),
};

export const ROD = "custom:cst_rod";
export const AXE = "custom:cst_axe";
export const MIN = 60_000;

/**
 * Мир по умолчанию: acc1 (кошелёк w1, герой h1) на суше 0,0, вода — 1,0;
 * удочка «Удочка» (износ 25 %) одна штука в руках; улов — «Рыба», 10 минут.
 * Кэш настройки тест сбрасывает сам (dropFishingConfigCache).
 */
export function resetFishing(): void {
  resetFx();
  Object.assign(s, { drops: [], queued: [], dropFails: false });
  fx.cfg = { intervalMin: 10, chancePct: 100, items: [{ id: "cst_fish", pct: 100 }] };
  fx.pos.set("acc1", { q: 0, r: 0, map: "map1", ver: 1 });
  fx.selected.add("h1");
  fx.cells.set("0,0", false);
  fx.cells.set("1,0", true);
  fx.cells.set("-1,0", false);
  fx.catalog.set("cst_rod", { name: "Удочка", rod: true, wear: 25 });
  fx.catalog.set("cst_rod2", { name: "Удочка-2", rod: true, wear: 50 });
  fx.catalog.set("cst_axe", { name: "Топор", wear: 34 });
  fx.catalog.set("cst_fish", { name: "Рыба" });
  fx.catalog.set("cst_pike", { name: "Щука" });
  packOf("h1").set(ROD, { count: 1, wear: 0 });
  fx.main.set("h1", ROD);
}

/** Сколько рыбы выдано всего (по всем вызовам выдачи и «Добыче»). */
export const fishGiven = (): number =>
  s.drops.reduce((n, d) => n + d.items.reduce((m, it) => m + it.amount, 0), 0) +
  s.queued.reduce((n, q) => n + q.amount, 0);

type FishMod = { getFishing: unknown; startFishing: unknown; stopFishing: unknown };

/** Вызовы ручек рыбалки (createServerFn подменён: ручка — обычная функция). */
export function fishKit(mod: FishMod) {
  let n = 0;
  const call = <T>(fn: unknown, data?: object) =>
    (fn as (a: { data?: object }) => Promise<T>)({ data });
  type View = import("@/lib/raid/fishing").FishView;
  return {
    start: (op = `press-${++n}-x`, minutes?: number) =>
      call<View>(mod.startFishing, minutes ? { op, minutes } : { op }),
    get: () => call<View>(mod.getFishing),
    stop: () => call<View>(mod.stopFishing),
    /** Часы вперёд на m минут. */
    wait: (m: number) => void (fx.now += m * MIN),
  };
}
