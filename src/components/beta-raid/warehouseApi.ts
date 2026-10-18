// Откуда окно склада берёт полки и куда перекладывает: склад на карте (клетка,
// 2 своих + 8 общих) или склад замка (только свои, 1–20). Окно одно.
import type { DepositScope } from "@/lib/warehouseCells";
import {
  getWarehouse,
  storeToWarehouse,
  takeFromWarehouse,
} from "@/server/api/beta-raid/warehouse";

export type WarehouseData = Awaited<ReturnType<typeof getWarehouse>>;

export type WarehouseApi = {
  key: readonly unknown[];
  load: () => Promise<WarehouseData>;
  store: (v: {
    stackKey: string;
    qty: number;
    scope: DepositScope;
  }) => Promise<{ own: number; shared: number }>;
  take: (v: { stackKey: string; scope: "own" | "shared"; qty: number }) => Promise<{ qty: number }>;
  /** Есть общая полка (склад на карте): показываем её и выбор «куда класть». */
  shared: boolean;
};

export function mapWarehouseApi(q: number, r: number): WarehouseApi {
  return {
    key: ["beta-warehouse", q, r],
    load: () => getWarehouse({ data: { q, r } }),
    store: (v) => storeToWarehouse({ data: { q, r, ...v } }),
    take: (v) => takeFromWarehouse({ data: { q, r, ...v } }),
    shared: true,
  };
}
