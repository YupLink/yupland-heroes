// Подбитый корабль (dynamite-08) не чинится: ни досками (ship-repair), ни заклинанием
// «Ремонт корабля» (spell-repair-ship) — отказ одним ключом «Подбитый корабль не
// починить». Подбитый в выборке последним: рядом есть что чинить — чинится оно.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; q: number; r: number; kind: string; hp: number; blasted: boolean };

const s = vi.hoisted(() => ({
  sql: [] as string[],
  ship: null as Row | null,
  taken: 0,
  published: 0,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_hero_backpack")) {
      return [{ stackKey: "custom:cst_plank", name: "Доска", count: 5 }];
    }
    if (sql.includes("SELECT s.id")) return s.ship ? [s.ship] : [];
    if (sql.includes("UPDATE yuplink.beta_raid_ship")) return s.ship ? [{ id: s.ship.id }] : [];
    return [];
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w.near" }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map_1",
  ownCell: async () => ({ q: 5, r: 5 }),
}));
vi.mock("./market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "hero_1" }),
  takeFromBackpackStack: async () => {
    s.taken++;
    return { taken: true };
  },
  returnToBackpackStack: async () => {},
}));
vi.mock("./plank-item", () => ({ plankStackKey: async () => "custom:cst_plank" }));
vi.mock("../../raidLive", () => ({ publishRaid: () => void s.published++ }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const boards = await import("./ship-repair");
const { repairShipNearHero } = await import("./spell-repair-ship");
const { BLASTED_NO_REPAIR } = await import("./ship-blasted");

type Call = (a: { data: { q: number; r: number; shipId?: string | null } }) => Promise<unknown>;
const info = boards.getShipRepair as unknown as Call;
const repair = boards.repairShip as unknown as Call;

const updates = () => s.sql.filter((x) => x.includes("UPDATE yuplink.beta_raid_ship"));
const pick = () => s.sql.find((x) => x.includes("SELECT s.id")) ?? "";

const wreck: Row = { id: "ship_w", q: 6, r: 5, kind: "small", hp: 0, blasted: true };
const broken: Row = { id: "ship_b", q: 6, r: 5, kind: "small", hp: 0, blasted: false };

beforeEach(() => {
  s.sql = [];
  s.ship = null;
  s.taken = 0;
  s.published = 0;
});

describe("доски: подбитый не чинится", () => {
  it("в окне кнопки нет — сервер отвечает пустотой", async () => {
    s.ship = wreck;
    expect(await info({ data: { q: 6, r: 5, shipId: "ship_w" } })).toBeNull();
  });

  it("починка отказывает ключом, доски не тронуты, записи нет", async () => {
    s.ship = wreck;
    await expect(repair({ data: { q: 6, r: 5, shipId: "ship_w" } })).rejects.toThrow(
      BLASTED_NO_REPAIR,
    );
    expect(BLASTED_NO_REPAIR).toBe("braid.ship_blasted_no_repair");
    expect(s.taken).toBe(0);
    expect(updates()).toHaveLength(0);
    expect(s.published).toBe(0);
  });

  it("подбитый в выборке последним: своё — первым, дальше целые раньше подбитых", async () => {
    await info({ data: { q: 6, r: 5 } });
    expect(pick()).toContain(
      "ORDER BY COALESCE(s.crew_account = 'acc_me', false) DESC, (s.blasted_at IS NOT NULL), s.hp",
    );
    expect(pick()).toContain("s.blasted_at IS NOT NULL AS blasted");
  });

  it("обычный разбитый чинится как раньше; запись не оживит подбитого в гонке", async () => {
    s.ship = broken;
    const res = await repair({ data: { q: 6, r: 5, shipId: "ship_b" } });
    expect(res).toMatchObject({ ok: true });
    expect(updates()[0]).toContain("WHERE id = 'ship_b' AND blasted_at IS NULL RETURNING id");
  });
});

describe("«Ремонт корабля»: подбитый не чинится", () => {
  it("рядом только подбитый — отказ тем же ключом, без записи (энергию вернёт каст)", async () => {
    s.ship = wreck;
    const res = await repairShipNearHero("w.near");
    expect(res).toEqual({ ok: false, reasonKey: BLASTED_NO_REPAIR });
    expect(updates()).toHaveLength(0);
    expect(s.published).toBe(0);
  });

  it("подбитый в выборке последним", async () => {
    s.ship = broken;
    const res = await repairShipNearHero("w.near");
    expect(res).toMatchObject({ ok: true, ship: { id: "ship_b" } });
    expect(pick()).toContain(
      "ORDER BY COALESCE(s.crew_account = 'acc_me', false) DESC, (s.blasted_at IS NOT NULL), s.hp",
    );
  });
});
