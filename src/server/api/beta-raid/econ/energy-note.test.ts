// Причины трат энергии: UPSERT по (аккаунт, день UTC, причина) складывает
// сумму и число списаний; без аккаунта или с нулём — мимо; сбой базы не
// долетает до шага (console.warn, не бросок).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../db/mcpClient", () => ({ mcpExec: vi.fn() }));
vi.mock("../owner", () => ({ raidOwner: vi.fn() }));

import { mcpExec } from "../../../db/mcpClient";
import { raidOwner } from "../owner";
import { energyNoteSql, noteEnergySpend, noteEnergySpendByWallet } from "./energy-note";

const exec = vi.mocked(mcpExec);
const owner = vi.mocked(raidOwner);

afterEach(() => {
  exec.mockReset();
  owner.mockReset();
});

describe("energy-note.energyNoteSql", () => {
  it("UPSERT: день по UTC, конфликт по ключу, сумма и счётчик растут", () => {
    const sql = energyNoteSql("acc_1", 2.5, "step");
    expect(sql).toContain("INSERT INTO yuplink.energy_spend_daily AS d");
    expect(sql).toContain("(now() AT TIME ZONE 'UTC')::date");
    expect(sql).toContain("VALUES ('acc_1', (now() AT TIME ZONE 'UTC')::date, 'step', 2.5, 1)");
    expect(sql).toContain("ON CONFLICT (account_id, day, reason) DO UPDATE");
    expect(sql).toContain("SET amount = d.amount + EXCLUDED.amount, n = d.n + 1");
  });

  it("кавычка в аккаунте экранируется", () => {
    expect(energyNoteSql("a'b", 1, "boss")).toContain("'a''b'");
  });
});

describe("energy-note.noteEnergySpend", () => {
  it("пишет одним mcpExec с причиной", async () => {
    exec.mockResolvedValueOnce([]);
    await noteEnergySpend("acc_1", 10, "fight");
    expect(exec).toHaveBeenCalledTimes(1);
    expect(String(exec.mock.calls[0][0])).toContain("'fight'");
    expect(exec.mock.calls[0][1]).toEqual({ wrapJson: false });
  });

  it("нет аккаунта или сумма ≤ 0 — в базу не ходим", async () => {
    await noteEnergySpend(null, 5, "step");
    await noteEnergySpend("acc_1", 0, "step");
    await noteEnergySpend("acc_1", -3, "step");
    expect(exec).not.toHaveBeenCalled();
  });

  it("трата энергии кончает рыбалку тем же оператором; покупка и стейкинг — нет (§8.35)", async () => {
    exec.mockResolvedValue([]);
    await noteEnergySpend("acc_1", 2, "step");
    await noteEnergySpend("acc_1", 5, "market");
    await noteEnergySpend("acc_1", 5, "stake");
    expect(exec).toHaveBeenCalledTimes(3);
    const [step, market, stake] = exec.mock.calls.map((c) => String(c[0]));
    expect(step).toContain("INSERT INTO yuplink.energy_spend_daily");
    expect(step).toContain("UPDATE yuplink.raid_fishing f");
    expect(step).toContain(
      "WHERE f.account_id = 'acc_1' AND f.stopped_at IS NULL AND f.acted_at IS NULL",
    );
    expect(market).not.toContain("raid_fishing");
    expect(stake).not.toContain("raid_fishing");
  });

  it("сбой базы — console.warn с причиной, наружу ничего не летит", async () => {
    exec.mockRejectedValueOnce(new Error("pool is closed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(noteEnergySpend("acc_1", 1, "portal")).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("energy-note", "portal", "pool is closed");
    warn.mockRestore();
  });
});

describe("energy-note.noteEnergySpendByWallet", () => {
  it("аккаунт берётся из кэша raidOwner", async () => {
    owner.mockResolvedValueOnce("acc_9");
    exec.mockResolvedValueOnce([]);
    await noteEnergySpendByWallet("w.tg", 3, "tower");
    expect(owner).toHaveBeenCalledWith("w.tg");
    expect(String(exec.mock.calls[0][0])).toContain("'acc_9'");
  });

  it("кошелёк без аккаунта — запись пропускается, ошибки нет", async () => {
    owner.mockRejectedValueOnce(new Error("Нет аккаунта"));
    await expect(noteEnergySpendByWallet("ghost", 3, "ship")).resolves.toBeUndefined();
    expect(exec).not.toHaveBeenCalled();
  });
});
