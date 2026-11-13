// Сломанный не надевается (§8.63 п.3) — каждый путь экипировки: надеть (и
// перенос в другое место), «надеть лучшее», комплект. При запущенной механике
// (флаг или админ) — отказ ключом «почини в кузнице», в «лучшем» и комплекте —
// пропуск; не запущена — для игроков всё как было (сломанный надевается).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Piece = {
  itemId: string;
  templateId: string;
  name: string;
  slot: string;
  rarity: string;
  imageUrl: null;
  statType: string;
  statAmount: number;
  wear: number;
};
const st = vi.hoisted(() => ({
  on: true,
  sqls: [] as string[],
  writes: [] as Array<{ heroId: string; eq: Record<string, string> }>,
  owned: [] as Piece[],
  equipped: {} as Record<string, string>,
  preset: {} as Record<string, string>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sqls.push(sql);
    if (sql.includes("FROM yuplink.hero_gear_preset")) return [{ name: "Бой", slots: st.preset }];
    if (sql.includes("COALESCE(t.slot, '') AS slot")) {
      return st.owned.map((p) => ({ id: p.itemId, slot: p.slot, wear: p.wear }));
    }
    return [];
  },
}));
vi.mock("@/server/auth", () => ({ requireWallet: () => "w.near" }));
vi.mock("@/server/api/user-shared", () => ({ accountOf: async () => "acc_1" }));
vi.mock("@/server/api/art-repair/art-repair-gate", () => ({ artBrokenOn: async () => st.on }));
vi.mock("@/server/api/beta-raid/hero-power", () => ({
  heroPowerEnabled: async () => true,
  invalidateHeroPower: () => {},
  loadHeroView: async () => null,
}));
vi.mock("@/server/api/beta-raid/hero-energy-sync", () => ({ syncHeroEnergy: async () => {} }));
vi.mock("@/server/api/beta-raid/hero-weaken", () => ({ loadWeakenFor: async () => ({}) }));
vi.mock("@/server/api/beta-raid/hero-buff", () => ({ loadBuffsFor: async () => ({}) }));
const hero = () => ({
  heroId: "h1",
  name: "Герой",
  imageUrl: null,
  race: null,
  spec: null,
  level: 1,
  rarity: "rare",
  skills: {},
  equipped: { ...st.equipped },
  gear: st.owned.filter((p) => Object.values(st.equipped).includes(p.itemId)),
});
vi.mock("@/server/api/beta-raid/hero-load", () => ({
  loadSelectedHero: async () => hero(),
  loadOwnedHero: async () => hero(),
}));
vi.mock("@/server/api/heroes-gear-copies", () => ({
  preferFreeCopies: async (_a: string, _h: string, eq: Record<string, string>) => eq,
}));
vi.mock("@/server/api/heroes-gear-read", () => ({
  ownedArtifact: async (_w: string, id: string) => st.owned.find((p) => p.itemId === id) ?? null,
  loadOwnedArtifacts: async () => st.owned,
  writeEquipped: async (heroId: string, eq: Record<string, string>) =>
    void st.writes.push({ heroId, eq }),
  gearView: () => ({ gear: "view" }),
  emptyGear: () => ({ gear: "empty" }),
}));

const { equipArtifact } = await import("./heroes-gear");
const { equipBestGear } = await import("./heroes-gear-best");
const { applyGearPreset } = await import("./heroes-gear-presets");
type Call<R> = (a?: unknown) => Promise<R>;
const equip = equipArtifact as unknown as Call<{ slotKey: string; itemId: string }>;
const best = equipBestGear as unknown as Call<{ changed: number }>;
const preset = applyGearPreset as unknown as Call<{ equipped: number; broken: number }>;

const art = (itemId: string, wear: number, statAmount: number, slot = "Голова"): Piece => ({
  itemId,
  templateId: `t_${itemId}`,
  name: `Арт ${itemId}`,
  slot,
  rarity: "common",
  imageUrl: null,
  statType: "attack",
  statAmount,
  wear,
});

beforeEach(() => {
  st.on = true;
  st.sqls.length = 0;
  st.writes.length = 0;
  st.equipped = {};
  st.preset = {};
  // Сломанный сильнее целого: без запрета «лучшее» выбрало бы его.
  st.owned = [art("broken", 100, 10), art("whole", 0, 5), art("ring", 100, 3, "Шея")];
});

describe("надеть", () => {
  it("сломанный при запущенной механике — отказ ключом, ничего не записано", async () => {
    await expect(equip({ data: { itemId: "broken" } })).rejects.toThrow("artbroken.locked");
    expect(st.writes).toEqual([]);
  });

  it("перенос надетого сломанного в другое место — тот же отказ", async () => {
    st.equipped = { Голова: "broken" };
    await expect(equip({ data: { itemId: "broken", slotKey: "Голова" } })).rejects.toThrow(
      "artbroken.locked",
    );
    expect(st.writes).toEqual([]);
  });

  it("целый — надевается", async () => {
    const r = await equip({ data: { itemId: "whole" } });
    expect(r.itemId).toBe("whole");
    expect(st.writes).toEqual([{ heroId: "h1", eq: { Голова: "whole" } }]);
  });

  it("механика не запущена — сломанный надевается, как раньше", async () => {
    st.on = false;
    await equip({ data: { itemId: "broken" } });
    expect(st.writes).toEqual([{ heroId: "h1", eq: { Голова: "broken" } }]);
  });
});

describe("надеть лучшее", () => {
  it("сломанный пропускается — берётся лучший целый", async () => {
    await best();
    expect(st.writes).toEqual([{ heroId: "h1", eq: { Голова: "whole" } }]);
  });

  it("надетый сломанный «лучшее» снимает", async () => {
    st.equipped = { Голова: "broken", Шея: "ring" };
    await best();
    expect(st.writes).toEqual([{ heroId: "h1", eq: { Голова: "whole" } }]);
  });

  it("механика не запущена — сломанный кандидат, как целый", async () => {
    st.on = false;
    await best();
    expect(st.writes).toEqual([{ heroId: "h1", eq: { Голова: "broken", Шея: "ring" } }]);
  });
});

describe("комплект", () => {
  it("сломанные из снимка не надеваются и считаются отдельно", async () => {
    st.preset = { Голова: "broken", Шея: "ring" };
    const r = await preset({ data: { id: "gp_1" } });
    expect(r).toMatchObject({ equipped: 0, broken: 2 });
    expect(st.writes).toEqual([{ heroId: "h1", eq: {} }]);
  });

  it("целые из снимка надеваются", async () => {
    st.preset = { Голова: "whole", Шея: "ring" };
    const r = await preset({ data: { id: "gp_1" } });
    expect(r).toMatchObject({ equipped: 1, broken: 1 });
    expect(st.writes).toEqual([{ heroId: "h1", eq: { Голова: "whole" } }]);
  });

  it("механика не запущена — комплект как раньше, сломанных не считаем", async () => {
    st.on = false;
    st.preset = { Голова: "broken", Шея: "ring" };
    const r = await preset({ data: { id: "gp_1" } });
    expect(r).toMatchObject({ equipped: 2, broken: 0 });
  });

  it("износ спрашиваем тем же запросом, что слот", async () => {
    st.preset = { Голова: "whole" };
    await preset({ data: { id: "gp_1" } });
    const q = st.sqls.filter((s) => s.includes("COALESCE(t.slot, '') AS slot, u.wear::float8"));
    expect(q).toHaveLength(1);
  });
});
