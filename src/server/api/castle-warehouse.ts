// Склад замка (владелец, 08.10.2026): такой же склад, как на карте, но личный —
// только свои ячейки, с одной до 20 (lib/castleWarehouse.ts). Товары лежат в
// той же таблице полок на месте «замок» и двигаются теми же ядрами «положить /
// забрать» (warehouse-put.ts, warehouse-take.ts). Перекладывать можно, когда
// герой у замка или ратуши. Игровой доступ — всем вошедшим игрокам.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { sb } from "../db/pg";
import { mcpExec } from "../db/mcpClient";
import { requireWallet } from "../auth";
import { sqlStr } from "./raid-shared";
import { raidOwner } from "./beta-raid/owner";
import { occupiedCells } from "@/lib/warehouseCells";
import { CASTLE_SHELF, MAX_CELLS, clampCells, nextCellCost } from "@/lib/castleWarehouse";

async function who() {
  const wallet = await requireWallet();
  return { wallet, account: await raidOwner(wallet) };
}

async function cellsOf(account: string): Promise<number> {
  const rows = (await mcpExec(
    `SELECT cells FROM yuplink.castle_warehouse WHERE account_id = ${sqlStr(account)};`,
    { wrapJson: true },
  )) as Array<{ cells: number }>;
  return clampCells(rows?.[0]?.cells);
}

async function requireAtCastle(wallet: string) {
  const { homeCastleStatus } = await import("./beta-raid/home-castle");
  if (!(await homeCastleStatus(wallet)).here)
    throw new Error("Перекладывать можно, когда герой в замке");
}

/** Окно склада замка: свои ячейки, рюкзак героя, следующая ячейка и ресурсы. */
export const getCastleWarehouse = createServerFn({ method: "GET" }).handler(async () => {
  const { wallet, account } = await who();
  const [{ loadSlots, toStack }, { resolveBackpack }, { loadBackpackPanel }] = await Promise.all([
    import("./beta-raid/warehouse-store"),
    import("./beta-raid/market-backpack"),
    import("./beta-raid/warehouse-backpack"),
  ]);
  const [cells, slots, bp, res] = await Promise.all([
    cellsOf(account),
    loadSlots(CASTLE_SHELF.mapId, CASTLE_SHELF.q, CASTLE_SHELF.r, account),
    resolveBackpack(wallet).catch(() => null),
    mcpExec(
      `SELECT resource, amount FROM yuplink.account_resources WHERE account_id = ${sqlStr(account)};`,
      {
        wrapJson: true,
      },
    ) as Promise<Array<{ resource: string; amount: number }>>,
  ]);
  const own = slots.filter((s) => s.scope === "own").map(toStack);
  return {
    name: "Склад",
    ownCells: cells,
    sharedCells: 0,
    ownUsed: occupiedCells(own.map((s) => s.count)),
    sharedUsed: 0,
    own,
    shared: [] as typeof own,
    backpack: bp ? await loadBackpackPanel(bp) : null,
    pending: [] as Array<{
      stackKey: string;
      kind: string;
      name: string;
      image: string | null;
      count: number;
    }>,
    maxCells: MAX_CELLS,
    nextCost: nextCellCost(cells),
    resources: Object.fromEntries((res ?? []).map((r) => [r.resource, Number(r.amount) || 0])),
  };
});

export const storeToCastleWarehouse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ stackKey: z.string().min(1), qty: z.number().positive().max(999) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { wallet, account } = await who();
    await requireAtCastle(wallet);
    const { putToShelf } = await import("./beta-raid/warehouse-put");
    return putToShelf({
      wallet,
      account,
      at: { ...CASTLE_SHELF, ownCells: await cellsOf(account), sharedCells: 0 },
      stackKey: data.stackKey,
      asked: data.qty,
      scope: "own",
    });
  });

export const takeFromCastleWarehouse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ stackKey: z.string().min(1), qty: z.number().positive().max(999) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { wallet, account } = await who();
    await requireAtCastle(wallet);
    const { takeFromShelf } = await import("./beta-raid/warehouse-take");
    return takeFromShelf({
      wallet,
      account,
      ...CASTLE_SHELF,
      scope: "own",
      stackKey: data.stackKey,
      qty: data.qty,
    });
  });

export const upgradeCastleWarehouse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ fromCells: z.number().int().min(1), opId: z.string().min(8).max(40) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { account } = await who();
    const cost = nextCellCost(data.fromCells);
    if (!cost) throw new Error(`Открыты все ${MAX_CELLS} ячеек`);
    const { error, data: rows } = await sb.rpc("castle_warehouse_upgrade", {
      p_account: account,
      p_from: data.fromCells,
      p_cost: cost,
      p_op: `cwh:${account}:${data.opId}`,
    });
    if (error) {
      const msg = String(error.message ?? "");
      if (/res_move: в минус/.test(msg)) throw new Error("Не хватает ресурсов");
      if (/cwh_cells_moved/.test(msg)) throw new Error("Склад уже изменился — обнови окно");
      if (/cwh_max_cells/.test(msg)) throw new Error(`Открыты все ${MAX_CELLS} ячеек`);
      throw new Error(msg || "Не удалось открыть ячейку");
    }
    return {
      cells: Number((rows as Array<{ cells: number }> | null)?.[0]?.cells ?? data.fromCells + 1),
    };
  });
