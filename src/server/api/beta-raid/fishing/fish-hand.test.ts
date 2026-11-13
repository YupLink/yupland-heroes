// Ловля руками (владелец, 21.10.2026): остров новичка, берег, без удочки; одна
// попытка — 1 энергии и 3 сытости (как рубка руками ×0,1); рыба — в рюкзак и в
// ачивку «Рыбак»; энергии нет — сытость назад; в мире — отказ.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  map: "isle_abc",
  shore: true,
  chance: 100,
  satiety: 100 as number,
  pay: [] as number[],
  payFail: false,
  delivered: [] as Array<[string, number]>,
  fisher: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async () => [{ land: s.shore, water: s.shore }],
}));
vi.mock("@/server/auth", () => ({ isAdminWallet: () => false }));
vi.mock("@/server/api/beta-raid/loot-bag/bag-actor", () => ({
  bagActor: async () => ({ wallet: "w1", account: "acc1", mapId: s.map }),
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  ownCell: async () => ({ q: 1, r: 1 }),
}));
vi.mock("@/server/api/beta-raid/fishing/fishing-config", () => ({
  loadFishingConfig: async () => ({
    intervalMin: 1,
    chancePct: s.chance,
    items: [{ id: "cst_fish", pct: 100 }],
  }),
}));
vi.mock("@/server/api/beta-raid/fishing/fishing-bonus", () => ({
  fishBonusOf: async () => ({ bonusPct: 0, addPct: 0 }),
}));
vi.mock("@/server/api/beta-raid/hero-satiety", () => ({
  takeSatiety: async (_w: string, need: number) => {
    if (s.satiety < need) return "short";
    s.satiety -= need;
    return "ok";
  },
  moveSatiety: async (_w: string, d: number) => void (s.satiety += d),
}));
vi.mock("@/server/api/beta-raid/encounter-pay", () => ({
  payForHit: async (_w: string, cost: number) => {
    if (s.payFail) throw new Error(`Нужно ${cost} энергии`);
    s.pay.push(cost);
    return { refund: async () => {} };
  },
}));
vi.mock("@/server/api/beta-raid/fishing/fishing-deliver", () => ({
  deliverCatch: async (o: { items: Map<string, number> }) => {
    s.delivered.push(...o.items);
    return [...o.items].map(([itemId, n]) => ({ itemId, name: "Рыба", image: null, n }));
  },
}));
vi.mock("@/server/api/achievements/bump", () => ({
  bumpAchievement: (_a: string, track: string, n: number) => {
    if (track === "fisher") s.fisher += n;
  },
}));

const { fishByHand } = await import("./fish-hand");
const fish = fishByHand as unknown as () => Promise<{
  got: Array<{ itemId: string }>;
  energy: number;
  satiety: number;
}>;

beforeEach(() =>
  Object.assign(s, {
    map: "isle_abc",
    shore: true,
    chance: 100,
    satiety: 100,
    pay: [],
    payFail: false,
    delivered: [],
    fisher: 0,
  }),
);

describe("ловля руками", () => {
  it("остров: 1 энергии и 3 сытости за попытку, рыба — в рюкзак и в «Рыбака»", async () => {
    const res = await fish();
    expect(res).toMatchObject({ energy: 1, satiety: 3 });
    expect(res.got.map((g) => g.itemId)).toEqual(["cst_fish"]);
    expect([s.pay, s.satiety, s.delivered, s.fisher]).toEqual([[1], 97, [["cst_fish", 1]], 1]);
  });

  it("не клюнуло — заплачено, ничего не выдано", async () => {
    s.chance = 0;
    const res = await fish();
    expect([res.got, s.pay, s.delivered, s.fisher]).toEqual([[], [1], [], 0]);
  });

  it("в мире — отказ, ничего не списано", async () => {
    s.map = "rmap_world";
    await expect(fish()).rejects.toThrow("fish.hand_island_only");
    expect([s.pay, s.satiety]).toEqual([[], 100]);
  });

  it("не на берегу — отказ", async () => {
    s.shore = false;
    await expect(fish()).rejects.toThrow("fish.cant_here");
  });

  it("сытости меньше 3 — отказ до энергии; энергии нет — сытость назад", async () => {
    s.satiety = 2;
    await expect(fish()).rejects.toThrow('fish.hand_hungry|{"n":3}');
    expect(s.pay).toEqual([]);
    Object.assign(s, { satiety: 50, payFail: true });
    await expect(fish()).rejects.toThrow("Нужно 1 энергии");
    expect(s.satiety).toBe(50);
  });
});
