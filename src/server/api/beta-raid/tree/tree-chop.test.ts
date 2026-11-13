// Рубка посаженного дерева (владелец, 22.10.2026: «деревья, которые садят
// игроки, — они не восстанавливаются после того, как их срубят»): посаженное
// после рубки исчезает навсегда — отрастания нет, его строка в очереди
// отрастания снята; кучка под ним снова видна у всех; дерево карты отрастает
// как раньше; сорвавшаяся рубка возвращает и дерево, и метку посадки.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  onCell: true,
  planted: false,
  covered: false,
  payFails: false,
  scheduled: [] as unknown[],
  bags: [] as unknown[],
  delta: [] as unknown[],
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("meta->'interact' AS interact")) {
      const interact = { on: true, cost: 3, itemId: "cst_wood", amount: "2", respawnMin: 15 };
      return [
        {
          id: "decoration_oak",
          name: "Дуб",
          interact,
          item_name: "Дерево",
          item_image: null,
          tools: null,
        },
      ];
    }
    if (sql.includes("SET decoration_id = NULL")) {
      const hit = s.onCell;
      s.onCell = false;
      return hit ? [{ q: 1, covered: s.covered, planted: s.planted }] : [];
    }
    if (sql.includes("SET decoration_id = 'decoration_oak'")) s.onCell = true;
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  myMapId: async () => "map1",
  playerCell: async () => ({ q: 0, r: 0 }),
  requireAdjacent: () => {},
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/api/beta-raid/encounter-pay", () => ({
  payForHit: async () => {
    if (s.payFails) throw new Error("Нужно 3 энергии");
    return { refund: async () => {} };
  },
}));
vi.mock("@/server/api/beta-raid/owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("@/server/api/beta-raid/decor-give", () => ({
  giveDecorItem: async () => ({ dropped: 0, queued: 0 }),
}));
vi.mock("@/server/api/beta-raid/decor-respawn", () => ({
  scheduleDecorRespawn: async (o: unknown) => void s.scheduled.push(o),
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({
  recordMapChange: async (_m: string, c: unknown) => void s.delta.push(c),
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: (e: unknown) => void s.bags.push(e) }));
vi.mock("@/server/api/achievements/bump", () => ({ bumpAchievement: async () => {} }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const mod = await import("@/server/api/beta-raid/decor-interact");
const chop = () =>
  (mod.interactDecor as unknown as (a: { data: object }) => Promise<unknown>)({
    data: { q: 1, r: 0, decorId: "decoration_oak" },
  });
const respawnDrops = () =>
  s.sql.filter((x) => x.includes("DELETE FROM yuplink.raid_decor_respawn"));

beforeEach(() => {
  Object.assign(s, { onCell: true, planted: false, covered: false, payFails: false });
  for (const k of ["sql", "scheduled", "bags", "delta"] as const) s[k].length = 0;
  mod.dropInteractiveDecorCache();
});

describe("рубка посаженного дерева", () => {
  it("рубка забирает декор и метку одним оператором и узнаёт, посажено ли", async () => {
    await chop();
    const take = s.sql.find((x) => x.includes("SET decoration_id = NULL"))!;
    expect(take).toContain("SET decoration_id = NULL, planted_decor = NULL");
    expect(take).toContain("COALESCE(was.mark = 'decoration_oak', false) AS planted");
  });

  it("посаженное — исчезает навсегда: отрастания нет, его строка в очереди снята", async () => {
    s.planted = true;
    await chop();
    expect(s.scheduled).toHaveLength(0);
    expect(respawnDrops()).toHaveLength(1);
    expect(respawnDrops()[0]).toContain("map_id = 'map1' AND d.q = 1 AND d.r = 0");
    expect(respawnDrops()[0]).toContain("d.decor_id = 'decoration_oak'");
    // Клетка пустеет у всех сразу.
    expect(s.delta).toEqual([{ patches: [{ q: 1, r: 0, decorationId: null }] }]);
  });

  it("кучка под посаженным — снова видна у тех, кто рядом", async () => {
    Object.assign(s, { planted: true, covered: true });
    await chop();
    expect(s.bags).toEqual([{ mapId: "map1", type: "bags", cells: ["1,0"] }]);
  });

  it("дерево карты отрастает как раньше", async () => {
    await chop();
    expect(s.scheduled).toEqual([
      { mapId: "map1", q: 1, r: 0, decorId: "decoration_oak", minutes: 15 },
    ]);
    expect(respawnDrops()).toHaveLength(0);
  });

  it("рубка сорвалась — дерево вернулось вместе с меткой посадки, отрастания нет", async () => {
    Object.assign(s, { planted: true, payFails: true });
    await expect(chop()).rejects.toThrow("Нужно 3 энергии");
    const back = s.sql.find((x) => x.includes("SET decoration_id = 'decoration_oak'"))!;
    expect(back).toContain("planted_decor = 'decoration_oak'");
    expect(back).toContain("decoration_id IS NULL");
    expect(s.onCell).toBe(true);
    expect(s.scheduled).toHaveLength(0);
    expect(respawnDrops()).toHaveLength(0);
  });

  it("сорвалась рубка дерева карты — метку не ставим", async () => {
    s.payFails = true;
    await expect(chop()).rejects.toThrow("Нужно 3 энергии");
    const back = s.sql.find((x) => x.includes("SET decoration_id = 'decoration_oak'"))!;
    expect(back).not.toContain("planted_decor");
  });
});
