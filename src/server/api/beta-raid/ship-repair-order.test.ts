// Починка досками: какой борт клетки чинить, если игрок не выбрал его в окне.
//
// Своё судно — первым. Ключ порядка обязан быть без NULL: у свободного борта
// crew_account пуст, голое `(crew = 'acc') DESC` ставило его ВПЕРЁД своего
// (NULL в DESC в Postgres идёт первым), и «починить» латало чужой обломок.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ sql: [] as string[] }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
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
  resolveBackpack: async () => null,
  takeFromBackpackStack: async () => null,
}));
vi.mock("./plank-item", () => ({ plankStackKey: async () => "custom:cst_plank" }));
vi.mock("../../raidLive", () => ({ publishRaid: () => {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const mod = await import("./ship-repair");
const info = mod.getShipRepair as unknown as (a: {
  data: { q: number; r: number; shipId?: string | null };
}) => Promise<unknown>;

const pick = () => s.sql.find((x) => x.includes("FROM yuplink.beta_raid_ship s")) ?? "";

beforeEach(() => {
  s.sql = [];
});

describe("damagedShipAt — порядок бортов клетки", () => {
  it("своё судно первым, и ключ порядка не бывает NULL", async () => {
    await info({ data: { q: 6, r: 5 } });
    const order = /ORDER BY\s+(.+?)\s+DESC/.exec(pick())?.[1] ?? "";
    expect(order).toBe("COALESCE(s.crew_account = 'acc_me', false)");
  });

  it("чужие занятые не чинятся: только свободные или своё", async () => {
    await info({ data: { q: 6, r: 5 } });
    expect(pick()).toContain("AND (s.crew_account IS NULL OR s.crew_account = 'acc_me')");
  });

  it("выбранный в окне борт — ровно он", async () => {
    await info({ data: { q: 6, r: 5, shipId: "ship_b" } });
    expect(pick()).toContain("AND s.id = 'ship_b'");
  });
});
