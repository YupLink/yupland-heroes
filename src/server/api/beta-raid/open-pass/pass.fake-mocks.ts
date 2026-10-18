// Подмены модулей и набор вызовов для тестов входа (pass*.test) поверх фейка
// сундука (plain-chest/pchest.fake) и входа (pass.fake): журнал трат энергии,
// мешочек вплотную, магический сундук клетки из фейка.
// В тесте: vi.mock("<модуль>", async () => (await import("./pass.fake-mocks")).<имя>).
import { f, resetFake } from "@/server/api/beta-raid/plain-chest/pchest.fake";
import { who } from "@/server/api/beta-raid/plain-chest/pchest.fake-mocks";

/** Записанные траты энергии: [кошелёк, сколько, причина]. */
export const notes: Array<[string, number, string]> = [];

export const energyNote = {
  noteEnergySpendByWallet: async (w: string, n: number, why: string) =>
    void notes.push([w, n, why]),
};

export const bagActor = {
  bagNear: async (_a: unknown, id: string) => ({ id, q: 5, r: 6, buried: false, alive: true }),
};

export const chestRow = {
  requireChestNear: async () => {},
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
  chestNearAny: async (a: { account: string }, q: number, r: number) => {
    const m = f.magic.get(`${q},${r}`);
    if (!m) throw new Error("chest.gone");
    return { chest: { owner_account: m.owner }, mine: m.owner === a.account };
  },
};

/** Мешочек клетки 5,6 и минута фейковых часов. */
export const BAG = `lb_${"a".repeat(32)}`;
export const MIN = 60_000;

type PassMod = { openStorage: unknown; closeStorage: unknown; passOpen: unknown };
type Open = { ok: true; paid: number; until: string | null };

/** Вызовы ручек входа у клетки 5,6 от аккаунта acc1 (кошелёк w1). */
export function passKit(pass: PassMod) {
  const call = <T>(fn: unknown, data: object) =>
    (fn as (a: { data: object }) => Promise<T>)({ data });
  let n = 0;
  return {
    open: (data: object = {}, op = `press-${++n}-x`) =>
      call<Open>(pass.openStorage, { q: 5, r: 6, op, ...data }),
    close: (o: { bagIds?: string[]; chest?: boolean; ops?: string[] } = {}) =>
      call(pass.closeStorage, { q: 5, r: 6, bagIds: [], ...o }),
    alive: (target: string) =>
      (pass.passOpen as (a: string, t: string) => Promise<boolean>)("acc1", target),
  };
}

/** Чистый фейк: acc1 на клетке 5,6 рядом с обычным сундуком pc_1, входы настоящие. */
export function resetPass(): void {
  resetFake();
  f.passAll = false;
  notes.length = 0;
  who.wallet = "w1";
  f.accounts.set("w1", "acc1");
  f.pos.set("w1", { q: 5, r: 6 });
  const chest = { id: "pc_1", q: 5, r: 6, itemId: "cst_box", name: "Сундук", buried: false };
  f.chests.set("5,6", { ...chest, placedBy: "acc9" });
}

/** Занятые ячейки обычного сундука pc_1: по стеку на число. */
export function fill(counts: number[]): void {
  let s = f.slots.get("pc_1");
  if (!s) f.slots.set("pc_1", (s = new Map()));
  for (const [i, c] of counts.entries()) {
    s.set(`custom:x${i}`, { count: c, kind: "custom", refId: null, name: "x" });
  }
}
