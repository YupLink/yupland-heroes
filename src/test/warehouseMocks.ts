// Подмены модулей для тестов переноса склад ↔ рюкзак: vi.mock в тесте берёт
// фабрики отсюда (`vi.mock(путь, async () => (await import(…)).имя)`) — одна
// копия на все файлы. База — фейк warehouseFake.ts; списание и возврат рюкзака
// остаются настоящими, их SQL фейк и считает.
import { vi } from "vitest";
import { db, fakeDb } from "@/test/warehouseFake";
import { fakeDeposit, fakeSlots, fakeUpsert } from "@/test/warehouseFakeOps";
import type { OriginQty } from "@/server/api/beta-raid/stack-origin";

/** Ответ res_move для ресурса с полки и что в него передали. */
export const rpc = { error: null as null | { message: string }, calls: [] as unknown[] };

export const reactStart = {
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
};
export const mcp = { mcpExec: async (sql: string) => fakeDb(sql) };
export const pg = {
  sb: {
    rpc: async (_fn: string, args: unknown) => {
      rpc.calls.push(args);
      return { error: rpc.error };
    },
  },
};
export const gate = { requireBetaRaid: async () => "w1" };
export const where = { myMapId: async () => "m1" };
export const move = { accAccountId: async () => "acc1" };
export const settle = { settleFieldsForWarehouse: async () => [] };
export const hooks = { noteShelf: async () => {} };
export const alias = { refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1) };
export const potion = {
  IS_POTION_SQL: "false",
  POTION_JOIN: "",
  potionKeysOf: async () => new Set<string>(),
};
export const store = {
  warehouseAt: async () => ({ name: "Склад" }),
  toStack: (x: unknown) => x,
  loadSlots: async (_m: string, _q: number, _r: number, account: string) => fakeSlots(account),
  upsertSlot: async (...a: unknown[]) =>
    fakeUpsert(
      a[2] as "own" | "shared",
      a[3] as string | null,
      a[4] as string,
      a[6] as number,
      a[9] as Partial<OriginQty> | undefined,
    ),
};

/** Рюкзак: списание и возврат — настоящие, выдача — фейк. */
export async function backpack() {
  const take = await vi.importActual<typeof import("@/server/api/beta-raid/market-backpack-take")>(
    "@/server/api/beta-raid/market-backpack-take",
  );
  const back = await vi.importActual<
    typeof import("@/server/api/beta-raid/market-backpack-return")
  >("@/server/api/beta-raid/market-backpack-return");
  return {
    resolveBackpack: async () => ({ heroId: db.hero, capacity: db.capacity, potionCapacity: 0 }),
    takeFromBackpackStack: take.takeFromBackpackStack,
    returnToBackpackStack: back.returnToBackpackStack,
    depositToBackpack: async (o: Parameters<typeof fakeDeposit>[0]) => fakeDeposit(o),
  };
}
