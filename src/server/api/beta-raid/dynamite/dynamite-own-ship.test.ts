// «Синим динамитом свой корабль взорвать нельзя — только чужой» (владелец, 30.10.2026):
// круг броска не делает целью свой корабль (владелец — аккаунт бросившего или, у старых
// строк, его кошелёк), ничьи и чужие — цель, как раньше; клетка, где кроме своего
// корабля задеть нечего, — красная с отказом dynamite.own_ship (база отвечает тем же до
// денег — dynamite-07-migration.test); живой список причалов свой корабль целью не делает.
import { describe, expect, it, vi } from "vitest";
import { withLiveShip } from "@/components/beta-raid/hand/handTap";

vi.mock("@tanstack/react-start", async () => (await import("./dynamite.fake")).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import("./dynamite.fake")).mcp);

const { dynamiteCellsSql, dynamiteChoices, shipSql } = await import("./dynamite-cells");
const { blastErrorKey } = await import("./dynamite-sql");

const ME = { account: "acc_me", wallet: "w_o'k" };
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("круг броска синего", () => {
  it("корабль-цель — ничей или чужой; свой — отдельным признаком", () => {
    const sql = flat(dynamiteCellsSql("rmap_1", { q: 0, r: 0 }, 3, "blue", ME));
    expect(sql).toContain(
      "AND s.q = c.q AND s.r = c.r AND (s.owner IS NULL OR s.owner NOT IN ('acc_me', 'w_o''k'))) AS ship",
    );
    expect(sql).toContain(
      "AND s.q = c.q AND s.r = c.r AND s.owner IN ('acc_me', 'w_o''k')) AS own",
    );
  });

  it("красный кораблей не видит вовсе; без бросающего — любой корабль, своих нет", () => {
    const red = flat(dynamiteCellsSql("rmap_1", { q: 0, r: 0 }, 3, "red", ME));
    expect(red).toContain("false AS ship, false AS own,");
    expect(flat(shipSql(null, true))).toBe("false");
    expect(flat(shipSql(null, false))).toBe(
      "EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s WHERE s.map_id = c.map_id AND s.q = c.q AND s.r = c.r)",
    );
  });

  it("только свой корабль и больше ничего — нельзя: dynamite.own_ship, без значка", () => {
    const base = { dome: false, town: false, mine: false, mob: false, decor: null };
    const out = dynamiteChoices(
      { q: 0, r: 0 },
      [
        { q: 1, r: 0, ...base, ship: false, own: true },
        { q: 2, r: 0, ...base, ship: true, own: true },
        { q: 0, r: 1, ...base, ship: true, own: false },
        { q: -1, r: 0, ...base, mob: true, ship: false, own: true },
      ],
      () => false,
    );
    const at = (dq: number, dr: number) => out.find((c) => c.dq === dq && c.dr === dr);
    expect(at(1, 0)).toEqual({
      dq: 1,
      dr: 0,
      ok: false,
      reason: "dynamite.own_ship",
      hit: null,
      ownShip: true,
    });
    // Свой и чужой на одной клетке — чужой цель (свой база не тронет).
    expect(at(2, 0)).toMatchObject({ ok: true, hit: "ship", ownShip: true });
    expect(at(0, 1)).toEqual({ dq: 0, dr: 1, ok: true, reason: null, hit: "ship" });
    // Свой корабль и моб — бросок идёт: моба взрыв заденет, корабль — нет.
    expect(at(-1, 0)).toMatchObject({ ok: true, reason: null, hit: "mob", ownShip: true });
  });

  it("отказ базы dynamite_own_ship — ключ словаря", () => {
    expect(blastErrorKey("ERROR: dynamite_own_ship", 100)).toBe("dynamite.own_ship");
  });
});

describe("рука: живой список причалов", () => {
  const blue = { kind: "dynamite" as const, stackKey: "custom:cst_hionm0xz40lz" };
  const water = { q: 2, r: 0, dq: 2, dr: 0, ok: true, reason: null, hit: null, cost: 100 };
  it("свой корабль на клетке — не цель: сто энергии впустую не уйдут", () => {
    expect(withLiveShip(blue, { ...water, ownShip: true }, { mine: false })?.hit).toBeNull();
    const refused = { ...water, ok: false, reason: "dynamite.own_ship", ownShip: true };
    expect(withLiveShip(blue, refused, { mine: false })).toEqual(refused);
  });
  it("чужой приплыл — цель, как раньше", () => {
    expect(withLiveShip(blue, water, { mine: false })?.hit).toBe("ship");
  });
});

describe("красный в воду: вода в круге — цель (рыба)", () => {
  it("SQL: признак воды — правило берега удочки; у синего воды нет", async () => {
    const { WATER_SQL } = await import("@/server/api/beta-raid/cell-sql");
    const red = flat(dynamiteCellsSql("rmap_1", { q: 0, r: 0 }, 3, "red", ME));
    expect(red).toContain(
      `EXISTS (SELECT 1 FROM yuplink.mystic_item_template t WHERE t.id = c.terrain_id AND ${WATER_SQL}) AS water`,
    );
    const blue = flat(dynamiteCellsSql("rmap_1", { q: 0, r: 0 }, 3, "blue", ME));
    expect(blue).toContain("false AS water");
  });

  it("вода — значок рыбы; моб и дерево на воде важнее", () => {
    const base = { dome: false, town: false, mine: false, mob: false, ship: false, decor: null };
    const out = dynamiteChoices(
      { q: 0, r: 0 },
      [
        { q: 1, r: 0, ...base, water: true },
        { q: 2, r: 0, ...base, water: true, mob: true },
        { q: 0, r: 1, ...base, water: false },
        { q: 0, r: 2, ...base, water: true, town: true },
      ],
      () => false,
    );
    const at = (dq: number, dr: number) => out.find((c) => c.dq === dq && c.dr === dr);
    expect(at(1, 0)).toEqual({ dq: 1, dr: 0, ok: true, reason: null, hit: "fish" });
    expect(at(2, 0)?.hit).toBe("mob");
    expect(at(0, 1)?.hit).toBeNull();
    expect(at(0, 2)).toMatchObject({ ok: false, hit: null });
  });
});
