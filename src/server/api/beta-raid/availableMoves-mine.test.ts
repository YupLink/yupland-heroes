// Кружки шагов сервера (getAvailableMoves): соседняя шахта кружка не получает
// (§8.59 п. 9) — тем же признаком, что и сам шаг (step-facts). Стоящий НА
// шахте видит кружки вокруг: сойти с неё можно.
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  pos: { q: 0, r: 0 },
  mines: new Set<string>(),
  sql: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (h: () => unknown) => () => h() }),
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("./voidGate", () => ({ canIgnoreVoid: () => false }));
vi.mock("./encounter-effects", () => ({ slowExtraCost: async () => 0 }));
vi.mock("./hero-power", () => ({ loadHeroPower: async () => null }));
vi.mock("./ship-crew", () => ({ myShip: async () => null }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    db.sql.push(sql);
    if (sql.includes("key = 'beta_raid_map'")) return [{ value: '{"mapId":"m1"}' }];
    if (sql.includes("FROM yuplink.beta_raid_positions")) return [db.pos];
    const at = /c\.q = (-?\d+) AND c\.r = (-?\d+)/.exec(sql);
    if (at && sql.includes("AS mine")) {
      const key = `${at[1]},${at[2]}`;
      return [{ terrain_id: "terrain_grass", mine: db.mines.has(key), water: false }];
    }
    return [];
  },
}));

import { getAvailableMoves } from "./availableMoves";
import { mineCellSql } from "./mine-cell-sql";

type Moves = { moves: Array<{ q: number; r: number }> };
const keys = async () => {
  const res = await (getAvailableMoves as unknown as () => Promise<Moves>)();
  return res.moves.map((m) => `${m.q},${m.r}`).sort();
};

beforeEach(() => {
  db.pos = { q: 0, r: 0 };
  db.mines = new Set();
  db.sql = [];
});

describe("getAvailableMoves и шахты", () => {
  it("соседняя шахта кружка не получает, остальные пять — получают", async () => {
    db.mines.add("1,0");
    const got = await keys();
    expect(got).toHaveLength(5);
    expect(got).not.toContain("1,0");
    expect(db.sql.some((s) => s.includes(`${mineCellSql("c")} AS mine`))).toBe(true);
  });

  it("герой стоит НА шахте — все шесть соседей открыты: сойти можно", async () => {
    db.pos = { q: 3, r: 3 };
    db.mines.add("3,3");
    expect(await keys()).toHaveLength(6);
  });
});
