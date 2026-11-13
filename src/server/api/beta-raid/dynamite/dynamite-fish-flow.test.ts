// Бросок красного в воду целиком (dynamite-throw + dynamite-fish + announce) на модели
// базы: рыба бросается сервером до вызова базы и уходит в него p_fish; в ответе —
// сколько всплыло (тост); мешочки-рыбы — событием «bags» по клетке; повтор нажатия —
// прежний итог без второго броска и второго взрыва. Синий в воду рыбу не ловит.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blastCells } from "@/lib/dynamite";

const fake = async () => await import("./dynamite.fake");
const h = vi.hoisted(() => ({ chance: 100 }));
vi.mock("@tanstack/react-start", async () => (await fake()).startFn);
vi.mock("@/server/db/mcpClient", async () => (await fake()).mcp);
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", async () => (await fake()).actor);
vi.mock("@/server/api/beta-raid/encounter-where", async () => (await fake()).where);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await fake()).backpack);
vi.mock("@/server/api/beta-raid/decor-interact-load", async () => (await fake()).decorLoad);
vi.mock("@/server/api/beta-raid/loot-bag/bag-deliver-parts", async () => (await fake()).bagParts);
vi.mock("@/server/raidLive", async () => (await fake()).live);
vi.mock("@/server/api/beta-raid/map-journal", async () => (await fake()).journal);
vi.mock("@/server/api/beta-raid/loot-bag/bag-sweep", async () => (await fake()).sweep);
vi.mock("@/server/api/beta-raid/econ/energy-note", async () => (await fake()).energyNote);
vi.mock("@/server/api/beta-raid/encounter-payout", async () => (await fake()).payout);
vi.mock("@/server/api/beta-raid/encounter-rewards", async () => (await fake()).rewards);
vi.mock("@/server/api/beta-raid/map-change-hooks", async () => (await fake()).hooks);
vi.mock(
  "@/server/api/beta-raid/mine-dismantle/mine-dismantle-announce",
  async () => (await fake()).dismantleAnnounce,
);
vi.mock("@/server/api/beta-raid/mine-lost/mine-lost-notify", async () => (await fake()).lostNotify);
vi.mock("@/server/api/beta-raid/decor-respawn", async () => (await fake()).respawn);
vi.mock("@/server/api/beta-raid/encounter-target", async () => (await fake()).target);
vi.mock("@/server/api/beta-raid/runner-reveal", async () => (await fake()).reveal);
vi.mock("@/server/api/beta-raid/fishing/fishing-config", () => ({
  loadFishingConfig: async () => ({
    intervalMin: 1,
    chancePct: h.chance,
    items: [{ id: "cst_pike", pct: 100 }],
  }),
}));
vi.mock("@/server/api/beta-raid/fishing/fishing-bonus", () => ({
  fishBonusOf: async () => ({ bonusPct: 0, addPct: 0 }),
}));
vi.mock("@/server/api/beta-raid/weather/weather-read", () => ({
  mapWeatherCoefs: async () => ({ fish: 1, mine: 1, farm: 1, step: 1, ship: 1 }),
}));

const { s, resetFake } = await import("./dynamite.fake");
const mod = await import("./dynamite-throw");
const throwIt = mod.throwDynamite as unknown as import("./dynamite.fake").ThrowFn;

const RED = "custom:cst_cpsl1cy0hpd7";
const BLUE = "custom:cst_hionm0xz40lz";
const data = { stackKey: RED, q: 1, r: 0, op: "op_abcdef" };
const WATER = blastCells({ q: 1, r: 0 }, "red").slice(0, 3);
const FISH = WATER.map((c, i) => ({ q: c.q, r: c.r, bag: `lb_fish${i}` }));
const EMPTY = { at: { q: 1, r: 0 }, paid: 100, mines: [], hits: [], guards: [], decor: [] };

/** p_fish из вызова функции базы — 12-й аргумент. */
function fishArg(sql: string): Array<{ q: number; r: number; items: Array<{ k: string }> }> {
  const m = /'red', '(\[.*\])'::jsonb\) AS res;/s.exec(sql);
  return m ? JSON.parse(m[1].replace(/''/g, "'")) : [];
}

beforeEach(() => {
  resetFake();
  h.chance = 100;
  s.waterRows = WATER.map((c) => ({ ...c }));
  s.result = { ...structuredClone(EMPTY), fish: FISH };
});

describe("красный в воду", () => {
  it("рыба каждой клетки воды — в вызов базы; ответ — сколько всплыло", async () => {
    const res = await throwIt({ data });
    expect(s.blastCalls).toHaveLength(1);
    const fish = fishArg(s.blastCalls[0]);
    expect(fish.map((f) => `${f.q},${f.r}`)).toEqual(WATER.map((c) => `${c.q},${c.r}`));
    expect(fish.every((f) => f.items[0]?.k === "custom:cst_pike")).toBe(true);
    expect(res).toMatchObject({ ok: true, fish: 3 });
  });

  it("мешочки-рыбы — событием «bags» по клетке, как мешочки декора", async () => {
    await throwIt({ data });
    const bags = s.log.filter((x) => (x as { event?: string }).event === "bags");
    expect(bags).toEqual(
      WATER.map((c) => expect.objectContaining({ mapId: "rmap_1", cells: [`${c.q},${c.r}`] })),
    );
  });

  it("шанс не сработал (0 %) — вызов прежний, без p_fish", async () => {
    h.chance = 0;
    s.result = structuredClone(EMPTY);
    const res = await throwIt({ data });
    expect(s.blastCalls[0]).toMatch(/'red'\) AS res;$/);
    expect(res.fish).toBe(0);
  });

  it("повтор нажатия — тот же итог: второго броска и второго взрыва нет", async () => {
    const first = await throwIt({ data });
    const again = await throwIt({ data });
    expect(s.blastCalls).toHaveLength(1);
    expect(again.fish).toBe(first.fish);
  });

  it("ответ потерялся после коммита — судит ключ, рыба та же", async () => {
    s.commitThenLose = true;
    const res = await throwIt({ data });
    expect(res.fish).toBe(3);
    expect(s.blastCalls).toHaveLength(1);
  });
});

describe("синий в воду", () => {
  it("рыбу не ловит: в вызове нет p_fish", async () => {
    s.result = { ...structuredClone(EMPTY), kind: "blue" };
    await throwIt({ data: { ...data, stackKey: BLUE } });
    expect(s.blastCalls[0]).toMatch(/'blue'\) AS res;$/);
  });
});
