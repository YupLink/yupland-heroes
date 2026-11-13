// Починка и смена режима шахт v2 (§8.59): цена — с сервера, ключ повтора — в
// пределах аккаунта, понятные отказы, рассылка изменения шахты; начисленное
// добычи — в ачивку «Хозяин шахт» тому, кому начислено.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  events: [] as Array<{ mapId: string | null; cells?: string[]; mine?: boolean }>,
  owner: "acc_me" as string | null,
  broken: false,
  resources: [{ resource: "gold", amount: 50 }] as Array<{ resource: string; amount: number }>,
  config: { resource: "wood", captureCost: 10 } as Record<string, unknown>,
  dbError: null as string | null,
  changed: true,
  near: true,
  credited: 0 as number | string,
  creditedTo: null as string | null,
  bumps: [] as string[],
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
  myMapId: async () => "maze",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {
    if (!s.near) throw new Error("Подойди ближе к объекту");
  },
}));
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("./floors", () => ({
  floorMaps: async (here: string) => [
    { id: here, floor: null },
    { id: "alpha", floor: "Мир Альфа" },
  ],
}));
vi.mock("./building-action", () => ({
  loadCellBuilding: async () => ({ effect: "mine", tier: 0, tiers: [{}], config: s.config }),
}));
vi.mock("./mine-v2-read", async (orig) => ({
  ...(await orig<typeof import("./mine-v2-read")>()),
  loadMineCell: async () => ({
    owner: s.broken ? null : s.owner,
    claimedHours: 0,
    capturedAt: null,
    pending: 0,
    view: s.broken ? { broken: true } : null,
    live: null,
  }),
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    if (sql.includes("account_achievement")) {
      s.bumps.push(sql.replace(/\s+/g, " "));
      return [];
    }
    s.sql.push(sql);
    if (sql.includes("account_resources")) return s.resources;
    if (s.dbError) throw new Error(s.dbError);
    if (sql.includes("raid_mine_repair")) {
      return [
        { captured: s.broken, applied: true, credited: s.credited, credited_to: s.creditedTo },
      ];
    }
    if (sql.includes("raid_mine_set_mode")) return [{ changed: s.changed, credited: s.credited }];
    return [];
  },
}));
vi.mock("../../raidLive", () => ({
  publishRaid: (e: { mapId: string | null; cells?: string[] }) => void s.events.push(e),
}));

const mod = await import("./mine-v2");
type Repair = (a: {
  data: { q: number; r: number; mode: string; opId: string };
}) => Promise<{ ok: true; captured: boolean; applied: boolean }>;
const repair = mod.repairMine as unknown as Repair;
const setMode = mod.setMineMode as unknown as (a: {
  data: { q: number; r: number; mode: string; mapId?: string };
}) => Promise<{ ok: true }>;
const data = { q: 1, r: 0, mode: "mid", opId: "op_12345678" };

beforeEach(() => {
  Object.assign(s, {
    sql: [],
    events: [],
    owner: "acc_me",
    broken: false,
    resources: [{ resource: "gold", amount: 50 }],
    config: { resource: "wood", captureCost: 10 },
    dbError: null,
    changed: true,
    near: true,
    credited: 0,
    creditedTo: null,
    bumps: [],
  });
});

describe("починка", () => {
  it("своя: цена с сервера, ключ повтора — в пределах аккаунта, событие шахты", async () => {
    const res = await repair({ data });
    expect(res).toEqual({ ok: true, captured: false, applied: true });
    const call = s.sql.find((x) => x.includes("raid_mine_repair")) ?? "";
    expect(call).toContain(`'{"gold":20}'::jsonb`);
    expect(call).toContain("'rep:acc_me:op_12345678'");
    expect(call).toContain("'mid'");
    expect(s.events).toEqual([
      { mapId: "maze", type: "built", mine: true, owner: false, cells: ["1,0"] },
    ]);
  });

  it("алмазная — дерево и камень; не хватает — ключ с числами", async () => {
    s.config = { resource: "diamonds", captureCost: 10 };
    s.resources = [
      { resource: "wood", amount: 12_000 },
      { resource: "stone", amount: 999.5 },
    ];
    await expect(repair({ data })).rejects.toThrow('braid.mine_short_stone|{"n":1000,"have":999}');
    expect(s.sql.some((x) => x.includes("raid_mine_repair"))).toBe(false);
  });

  it("сломанная/ничья — забирает тот, кто платит", async () => {
    s.broken = true;
    s.owner = "acc_other";
    const res = await repair({ data });
    expect(res.captured).toBe(true);
    expect(s.events[0]).toMatchObject({ mine: true, owner: true });
  });

  it("ачивка «Хозяин шахт» — тому, кому база начислила добычу", async () => {
    // Своя: накопленное — хозяину.
    s.credited = "60.0000";
    s.creditedTo = "acc_me";
    await repair({ data });
    expect(s.bumps).toHaveLength(1);
    expect(s.bumps[0]).toContain("SELECT 'acc_me', 'minelord', (60)::bigint");
    // Сломалась внутри чужой починки — прежнему хозяину.
    s.broken = true;
    s.credited = 50;
    s.creditedTo = "acc_prev";
    await repair({ data });
    expect(s.bumps[1]).toContain("SELECT 'acc_prev', 'minelord', (50)::bigint");
    // Нечего — ничего.
    s.credited = 0;
    s.creditedTo = null;
    await repair({ data });
    expect(s.bumps).toHaveLength(2);
  });

  it("чужая работающая — отказ до денег; рядом стоять обязательно", async () => {
    s.owner = "acc_other";
    await expect(repair({ data })).rejects.toThrow("braid.mine_owned");
    s.owner = "acc_me";
    s.near = false;
    await expect(repair({ data })).rejects.toThrow("Подойди ближе");
  });

  it("не v2 (DARAI, лесопилка острова) — не чинится", async () => {
    s.config = { resource: "token", token: "Darai", yield: 1 };
    await expect(repair({ data })).rejects.toThrow("braid.mine_not_v2");
    s.config = { resource: "wood", yield: 1, maxHours: 168 };
    await expect(repair({ data })).rejects.toThrow("braid.mine_not_v2");
  });

  it("отказ базы — ключом словаря", async () => {
    s.dbError = "MCP error: res_move: в минус";
    await expect(repair({ data })).rejects.toThrow("braid.mine_repair_no_res");
    s.dbError = "MCP error: mine_owned";
    await expect(repair({ data })).rejects.toThrow("braid.mine_owned");
    expect(s.events).toEqual([]);
  });
});

describe("режим", () => {
  it("сменили — событие шахты; тот же режим — тихо", async () => {
    await setMode({ data: { q: 2, r: -1, mode: "max" } });
    const flat = s.sql.map((x) => x.replace(/\s+/g, " "));
    expect(flat.some((x) => x.includes("raid_mine_set_mode('maze', 2, -1, 'acc_me', 'max')"))).toBe(
      true,
    );
    expect(s.events).toHaveLength(1);
    s.changed = false;
    await setMode({ data: { q: 2, r: -1, mode: "max" } });
    expect(s.events).toHaveLength(1);
    expect(s.bumps).toEqual([]);
  });

  it("накопленное по старому режиму (с неполным часом) — в ачивку хозяину целыми", async () => {
    // 3 ч × 10 + 0,25 ч × 10: база отдаёт сумму с хвостом.
    s.credited = "32.5000";
    await setMode({ data: { q: 2, r: -1, mode: "mid" } });
    expect(s.bumps).toHaveLength(1);
    expect(s.bumps[0]).toContain("SELECT 'acc_me', 'minelord', (32)::bigint");
    // Только хвост меньше единицы — ачивке нечего.
    s.credited = "0.9500";
    await setMode({ data: { q: 2, r: -1, mode: "base" } });
    expect(s.bumps).toHaveLength(1);
  });

  it("из «Добычи» — шахта другого этажа; чужая карта — отказ до базы", async () => {
    await setMode({ data: { q: 2, r: -1, mode: "mid", mapId: "alpha" } });
    const flat = s.sql.map((x) => x.replace(/\s+/g, " ")).join("\n");
    expect(flat).toContain("raid_mine_set_mode('alpha', 2, -1, 'acc_me', 'mid')");
    expect(s.events[0]).toMatchObject({ mapId: "alpha", cells: ["2,-1"] });
    s.sql = [];
    await expect(setMode({ data: { q: 2, r: -1, mode: "mid", mapId: "draft" } })).rejects.toThrow(
      "braid.mine_not_owner",
    );
    expect(s.sql).toEqual([]);
  });

  it("сломана / не хозяин — понятный текст", async () => {
    s.dbError = "mine_broken";
    await expect(setMode({ data: { q: 2, r: -1, mode: "base" } })).rejects.toThrow(
      "braid.mine_broken",
    );
    s.dbError = "mine_not_owner";
    await expect(setMode({ data: { q: 2, r: -1, mode: "base" } })).rejects.toThrow(
      "braid.mine_not_owner",
    );
  });
});
