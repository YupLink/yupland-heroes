import { describe, expect, it } from "vitest";
import {
  FARM_UPGRADE_MULT,
  NO_UPGRADES,
  UPGRADE_DIAMONDS,
  farmMultWith,
  ownCellsWith,
} from "./accountUpgrade";
import { OWN_CELLS } from "./warehouseCells";
import { readFileSync } from "node:fs";

describe("улучшение игрока за алмаз — одно, частное", () => {
  it("не купил — ни +50 %, ни ячейки", () => {
    expect(ownCellsWith(NO_UPGRADES)).toBe(OWN_CELLS);
    expect(farmMultWith(NO_UPGRADES)).toBe(1);
  });

  it("купил в любом окне — +50 % и +1 ячейка, вдвоём не складывается", () => {
    for (const u of [
      { farm: true, warehouse: false },
      { farm: false, warehouse: true },
      { farm: true, warehouse: true },
    ]) {
      expect(ownCellsWith(u)).toBe(OWN_CELLS + 1);
      expect(farmMultWith(u)).toBe(FARM_UPGRADE_MULT);
    }
  });

  it("база — то же: множитель на долю работника, повтор в другом окне не списывает", () => {
    const farm01 = readFileSync("migrations/farm-01-upgrades.sql", "utf8");
    expect(farm01).toContain("* yuplink.account_farm_mult(raid_field_worker.account_id)");
    expect(farm01).toContain("* yuplink.account_farm_mult(p_account)");
    const sql = readFileSync("migrations/farm-02-one-upgrade.sql", "utf8");
    expect(sql).toContain(`THEN ${FARM_UPGRADE_MULT} ELSE 1 END`);
    expect(sql).toContain("WHERE account_id = p_account) THEN\n    RETURN 'already'");
    expect(sql).not.toContain("kind = 'farm'");
    expect(UPGRADE_DIAMONDS).toBeGreaterThan(0);
  });
});
