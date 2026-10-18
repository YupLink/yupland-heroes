// Журнал сундука: грабёж — две стороны в два шага (в миг победы владелец
// потерял всё, при выборе победитель унёс взятое), ключи повтора от id
// добычи; подписи ленты для владельца панели.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { mcpExec } from "@/server/db/mcpClient";
import {
  noteChestLoot,
  noteChestMove,
  noteChestSeize,
} from "@/server/api/beta-raid/econ/chest-note";
import { tradeNote } from "@/server/api/beta-raid/econ/trade-note";

const exec = vi.mocked(mcpExec);
afterEach(() => exec.mockReset());

const place = { mapId: "rmap_x", q: 3, r: 4 };
const ore = { stackKey: "custom:cst_ore", kind: "custom", refId: "cst_ore", name: "Руда" };
const chest = {
  stackKey: "custom:cst_magic_chest",
  kind: "custom",
  refId: "cst_magic_chest",
  name: "Магический сундук",
};
const who = { ...place, plunderId: "plu_1", owner: "acc_o", raider: "acc_r" };

describe("журнал грабежа", () => {
  it("захват: у владельца — всё, что ушло в добычу (pay), вместе с сундуком", async () => {
    exec.mockResolvedValue([]);
    await noteChestSeize({
      ...who,
      items: [
        { ...chest, count: 1 },
        { ...ore, count: 40 },
      ],
    });
    const sql = String(exec.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("'acc_o', 'acc_r', 'rmap_x', 3, 4, 'chest_plunder', 'pay'");
    expect(sql).toContain("'plu_1:o0'");
    expect(sql).toContain("'plu_1:o1'");
    expect(sql).not.toContain("'take'");
  });

  it("выбор: у победителя — только унесённое (take)", async () => {
    exec.mockResolvedValue([]);
    await noteChestLoot({
      ...who,
      items: [chest, ore],
      taken: [{ stackKey: "custom:cst_ore", qty: 25 }],
    });
    const sql = String(exec.mock.calls[0]?.[0] ?? "");
    expect(sql).toContain("'acc_r', 'acc_o', 'rmap_x', 3, 4, 'chest_plunder', 'take'");
    expect(sql).toContain(", 25, NULL, NULL, NULL, 'plu_1:r0')");
    expect(sql).not.toContain("'pay'");
  });

  it("чужой положил в сеть хозяина (30.09): put с контрагентом-хозяином; свой — без контрагента", async () => {
    exec.mockResolvedValue([]);
    const put = { ...place, side: "put" as const, stackKey: ore.stackKey, snap: ore, qty: 5 };
    await noteChestMove({ ...put, account: "acc_t", counterparty: "acc_o", ref: "chestput:1" });
    await noteChestMove({ ...put, account: "acc_o", ref: "chestput:2" });
    const sql = (i: number) => String(exec.mock.calls[i]?.[0] ?? "");
    expect(sql(0)).toContain("'acc_t', 'acc_o', 'rmap_x', 3, 4, 'chest', 'put'");
    expect(sql(1)).toContain("'acc_o', NULL, 'rmap_x', 3, 4, 'chest', 'put'");
  });

  it("сбой записи наружу не выходит", async () => {
    exec.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      noteChestMove({
        ...place,
        side: "put",
        account: "acc_o",
        stackKey: ore.stackKey,
        snap: ore,
        qty: 5,
        ref: "chestput:1",
      }),
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });
});

describe("подписи ленты", () => {
  const base = {
    itemName: "Руда",
    qty: 5,
    priceUnit: null,
    priceCur: null,
    total: null,
    q: 3,
    r: 4,
    counterpartyName: "@thief",
  };

  it("свой сундук: положил / забрал", () => {
    expect(tradeNote({ ...base, source: "chest", side: "put" })).toBe(
      "положил 5 × Руда в свой сундук (3,4)",
    );
    expect(tradeNote({ ...base, source: "chest", side: "take" })).toBe(
      "забрал 5 × Руда из своего сундука (3,4)",
    );
  });

  it("грабёж: владелец потерял, грабитель унёс", () => {
    expect(tradeNote({ ...base, source: "chest_plunder", side: "pay" })).toBe(
      "потерял 5 × Руда — сундук (3,4) разграбил @thief",
    );
    expect(
      tradeNote({ ...base, source: "chest_plunder", side: "take", counterpartyName: "@owner" }),
    ).toBe("унёс 5 × Руда из сундука @owner (3,4)");
  });
});
