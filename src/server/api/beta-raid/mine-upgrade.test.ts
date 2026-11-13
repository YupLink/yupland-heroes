// Улучшение шахты (§8.74): только хозяин работающей шахты мира и только
// Строитель; цена — серверная, по уровню клетки; ключ повтора — аккаунта;
// нехватка — ключ «на улучшение»; рассылка — только если улучшили.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  spec: "Строитель" as string | null,
  owner: "acc_me" as string | null,
  broken: false,
  level: 1,
  config: { effect: "mine", resource: "wood" } as Record<string, unknown>,
  diamonds: 10,
  applied: true,
  published: 0,
  replay: null as number | null,
  dbError: null as string | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "me.near" }));
vi.mock("../../rateGate", () => ({ actionGate: async () => {} }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map_w",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {},
}));
vi.mock("./building-action", () => ({
  loadCellBuilding: async () => ({ effect: "mine", tier: 0, tiers: [{}], config: s.config }),
}));
vi.mock("./market-backpack", () => ({
  resolveBackpack: async () => (s.spec === null ? null : { spec: s.spec }),
}));
vi.mock("./mine-v2-read", async (orig) => ({
  ...(await orig<typeof import("./mine-v2-read")>()),
  loadMineCell: async () => ({
    owner: s.owner,
    claimedHours: 0,
    capturedAt: 0,
    pending: 0,
    view: { broken: s.broken, level: s.level },
    live: null,
  }),
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("account_achievement")) return [];
    s.sql.push(sql);
    if (sql.includes("account_resources")) return [{ resource: "diamonds", amount: s.diamonds }];
    if (sql.includes("FROM yuplink.raid_mine_op")) return s.replay === null ? [] : [{ lvl: s.replay }];
    if (sql.includes("raid_mine_upgrade")) {
      if (s.dbError) throw new Error(s.dbError);
      return [{ applied: s.applied, new_level: s.level + 1, credited: 3 }];
    }
    return [];
  },
}));
vi.mock("../../raidLive", () => ({
  publishRaid: () => {
    s.published += 1;
  },
}));

const { upgradeMine } = await import("./mine-upgrade");
const up = upgradeMine as unknown as (a: {
  data: { q: number; r: number; opId: string };
}) => Promise<{ ok: true; level: number; applied: boolean }>;
const run = () => up({ data: { q: 2, r: 3, opId: "op-12345678" } });

beforeEach(() => {
  Object.assign(s, {
    sql: [],
    spec: "Строитель",
    owner: "acc_me",
    broken: false,
    level: 1,
    config: { effect: "mine", resource: "wood" },
    diamonds: 10,
    applied: true,
    published: 0,
    replay: null,
    dbError: null,
  });
});

describe("upgradeMine", () => {
  it("Строитель, своя шахта: цена шага по уровню, ключ аккаунта, рассылка", async () => {
    s.level = 2;
    expect(await run()).toEqual({ ok: true, level: 3, applied: true });
    const call = s.sql.find((x) => x.includes("raid_mine_upgrade"))!;
    expect(call).toContain("'up:acc_me:op-12345678'");
    expect(call).toContain("'map_w', 2,");
    expect(call).toContain(", 2,\n");
    expect(call).toContain(`'{"diamonds":2}'::jsonb`);
    expect(s.published).toBe(1);
  });

  it("не Строитель — отказ до списаний", async () => {
    s.spec = "Воин";
    await expect(run()).rejects.toThrow("braid.mine_need_builder");
    s.spec = null;
    await expect(run()).rejects.toThrow("braid.mine_need_builder");
    expect(s.sql.some((x) => x.includes("raid_mine_upgrade"))).toBe(false);
  });

  it("чужая, сломанная, остров, предел — отказы", async () => {
    s.owner = "acc_other";
    await expect(run()).rejects.toThrow("braid.mine_not_owner");
    s.owner = "acc_me";
    s.broken = true;
    await expect(run()).rejects.toThrow("braid.mine_broken");
    s.broken = false;
    s.level = 4;
    await expect(run()).rejects.toThrow("braid.mine_level_max");
    expect(s.sql.some((x) => x.includes("raid_mine_upgrade"))).toBe(false);
  });

  it("не хватает алмазов — ключ «на улучшение» с числами", async () => {
    s.level = 3;
    s.diamonds = 4;
    await expect(run()).rejects.toThrow('braid.mine_up_short_diamonds|{"n":5,"have":4}');
  });

  it("повтор после потерянного ответа: ключ есть — прежний уровень, без проверок и списаний", async () => {
    s.replay = 4;
    s.level = 4;
    expect(await run()).toEqual({ ok: true, level: 4, applied: false });
    expect(s.sql.some((x) => x.includes("raid_mine_upgrade("))).toBe(false);
    expect(s.sql[0]).toContain("'up:acc_me:op-12345678'");
  });

  it("база не дала списать — «не хватает на улучшение», а не на починку", async () => {
    s.dbError = "mcp: res_move: в минус (diamonds)";
    await expect(run()).rejects.toThrow("braid.mine_up_no_res");
    s.dbError = "mine_level_changed";
    await expect(run()).rejects.toThrow("braid.mine_level_changed");
  });

  it("повтор ключа — без рассылки", async () => {
    s.applied = false;
    expect((await run()).applied).toBe(false);
    expect(s.published).toBe(0);
  });
});
