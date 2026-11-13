// Бросок динамита целиком (dynamite-throw + announce + kills) на модели базы:
//  · отказ (далеко, не динамит, остров, нет энергии, город…) — ничего наружу,
//    энергия не учтена;
//  · успех: «mine_blast» ДО дельты разборки, декор — дельтой, мешочки — по
//    клеткам, отрастание — после дельты и не у посаженного; охрана — «built»;
//    повержённые — «defeated», награда по топу бросившему; ключ отмечен;
//  · повтор нажатия — прошлый итог без второго взрыва и второй рассылки;
//  · ответ потерялся после коммита — судит ключ, второго взрыва нет.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = async () => await import("./dynamite.fake");
vi.mock("@tanstack/react-start", async () => (await fake()).startFn);
vi.mock("@/server/db/mcpClient", async () => (await fake()).mcp);
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", async () => (await fake()).actor);
vi.mock("@/server/api/beta-raid/encounter-where", async () => (await fake()).where);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await fake()).backpack);
vi.mock("@/server/api/beta-raid/decor-interact-load", async () => (await fake()).decorLoad);
vi.mock("@/server/api/beta-raid/loot-bag/bag-deliver-parts", async () => (await fake()).bagParts);
vi.mock("@/server/raidLive", async () => (await fake()).live);
vi.mock("@/server/api/beta-raid/map-journal", async () => (await fake()).journal);
vi.mock(
  "@/server/api/beta-raid/mine-dismantle/mine-dismantle-announce",
  async () => (await fake()).dismantleAnnounce,
);
vi.mock("@/server/api/beta-raid/mine-lost/mine-lost-notify", async () => (await fake()).lostNotify);
vi.mock("@/server/api/beta-raid/loot-bag/bag-sweep", async () => (await fake()).sweep);
vi.mock("@/server/api/beta-raid/decor-respawn", async () => (await fake()).respawn);
vi.mock("@/server/api/beta-raid/econ/energy-note", async () => (await fake()).energyNote);
vi.mock("@/server/api/beta-raid/encounter-target", async () => (await fake()).target);
vi.mock("@/server/api/beta-raid/encounter-payout", async () => (await fake()).payout);
vi.mock("@/server/api/beta-raid/encounter-rewards", async () => (await fake()).rewards);
vi.mock("@/server/api/beta-raid/map-change-hooks", async () => (await fake()).hooks);
vi.mock("@/server/api/beta-raid/runner-reveal", async () => (await fake()).reveal);

const { s, resetFake } = await import("./dynamite.fake");
const mod = await import("./dynamite-throw");
const throwIt = mod.throwDynamite as unknown as import("./dynamite.fake").ThrowFn;

const STACK = "custom:cst_cpsl1cy0hpd7";
const data = { stackKey: STACK, q: 1, r: 0, op: "op_abcdef" };
const OP = "dyn:acc_me:op_abcdef";

const BLAST = {
  at: { q: 1, r: 0 },
  paid: 100,
  mines: [
    {
      q: 2,
      r: 0,
      op: `dyn:${OP}:2:0`,
      resource: "gold",
      building: "building_UbJz0SbcXB",
      skin: null,
      block: false,
    },
  ],
  hits: [
    {
      q: 1,
      r: 0,
      layer: 0,
      hp: "brh_a",
      gen: 3,
      obj: "boss:rbt_w",
      cfg: null,
      dealt: 100,
      after: 0,
      max: 1000,
      killed: true,
    },
    {
      q: 1,
      r: 1,
      layer: 0,
      hp: "brh_b",
      gen: 0,
      obj: "boss:rbt_w",
      cfg: null,
      dealt: 100,
      after: 900,
      max: 1000,
      killed: false,
    },
    {
      q: 0,
      r: 1,
      layer: 1,
      hp: "brh_c",
      gen: 0,
      obj: "boss:rbt_r",
      cfg: null,
      dealt: 50,
      after: 0,
      max: 500,
      killed: true,
    },
  ],
  guards: [{ q: 1, r: -1, dealt: 30, killed: true, chest: false }],
  decor: [
    { q: 0, r: 0, d: "decoration_oak", planted: false, bag: "lb_1", re: 30 },
    { q: 2, r: -1, d: "decoration_oak", planted: true, bag: "lb_2", re: 30 },
  ],
};

const idx = (pred: (x: Record<string, unknown>) => boolean) =>
  s.log.findIndex((x) => pred(x as Record<string, unknown>));

beforeEach(() => {
  resetFake();
  s.result = structuredClone(BLAST);
});

describe("отказы — ничего не списано и не разослано", () => {
  it("не динамит, остров, далеко — до базы", async () => {
    await expect(throwIt({ data: { ...data, stackKey: "custom:cst_x" } })).rejects.toThrow(
      "dynamite.no_item",
    );
    s.island = true;
    await expect(throwIt({ data })).rejects.toThrow("dynamite.island");
    s.island = false;
    await expect(throwIt({ data: { ...data, q: 4 } })).rejects.toThrow("dynamite.far");
    expect(s.blastCalls).toEqual([]);
    expect(s.log).toEqual([]);
  });

  it("нет энергии — ключ с ценой; база откатила всё", async () => {
    s.dbError = "not_enough_energy:40:100";
    await expect(throwIt({ data })).rejects.toThrow('mineplace.no_energy|{"need":100}');
    expect(s.log).toEqual([]);
    expect(s.spends).toEqual([]);
    expect(s.ops.size).toBe(0);
  });

  it("город, купол, нет динамита, далеко по базе — ключи словаря", async () => {
    for (const [err, key] of [
      ["dynamite_town", "dynamite.town"],
      ["dynamite_void", "dynamite.void"],
      ["dynamite_no_item", "dynamite.no_item"],
      ["dynamite_far", "dynamite.far"],
      ["deadlock detected", "dynamite.busy"],
    ]) {
      s.dbError = err;
      await expect(throwIt({ data })).rejects.toThrow(key);
    }
    expect(s.log).toEqual([]);
  });
});

describe("взрыв и рассылка", () => {
  it("итог, энергия учтена, своя карта — снятый декор и повержённый верхний", async () => {
    const res = await throwIt({ data });
    expect(res).toMatchObject({ ok: true, mines: 1, hits: 4, kills: 3, decor: 2 });
    expect(res.decorCells).toEqual([
      { q: 0, r: 0 },
      { q: 2, r: -1 },
    ]);
    expect(res.killedCells).toEqual([{ q: 1, r: 0 }]);
    expect(res.rewards).toHaveLength(2);
    expect(s.spends).toEqual([["acc_me", 100, "other"]]);
    expect(s.blastCalls[0]).toContain("'custom:cst_cpsl1cy0hpd7', 100::numeric");
  });

  it("«mine_blast» всем — ДО дельты, которая снимает шахту; вид по шаблону", async () => {
    await throwIt({ data });
    const blast = idx((x) => x.event === "mine_blast");
    expect(s.log[blast]).toMatchObject({ mapId: "rmap_1", cells: [{ q: 2, r: 0, kind: "gold" }] });
    expect(blast).toBeLessThan(idx((x) => x.dismantle === `dyn:${OP}:2:0`));
    expect(blast).toBeLessThan(idx((x) => "journal" in x));
    expect(idx((x) => x.notify === true)).toBeGreaterThan(blast);
  });

  it("декор: дельта, мешочки по клеткам, отрастание после дельты и не у посаженного", async () => {
    await throwIt({ data });
    const delta = idx((x) => "journal" in x);
    expect(s.log[delta]).toMatchObject({
      journal: {
        patches: [
          { q: 0, r: 0, decorationId: null },
          { q: 2, r: -1, decorationId: null },
        ],
      },
    });
    const bags = s.log.filter((x) => (x as { event?: string }).event === "bags");
    expect(bags).toEqual([
      expect.objectContaining({ cells: ["0,0"] }),
      expect.objectContaining({ cells: ["2,-1"] }),
    ]);
    const regrow = s.log.filter((x) => "respawn" in (x as object));
    expect(regrow).toEqual([
      { respawn: { mapId: "rmap_1", q: 0, r: 0, decorId: "decoration_oak", minutes: 30 } },
    ]);
    expect(idx((x) => "respawn" in x)).toBeGreaterThan(delta);
  });

  it("охрана — «built» с mine; повержённые — «defeated» и награда по топу бросившему", async () => {
    await throwIt({ data });
    expect(s.log).toContainEqual(
      expect.objectContaining({ event: "built", mine: true, cells: ["1,-1"] }),
    );
    expect(s.log).toContainEqual(
      expect.objectContaining({ event: "defeated", cells: ["1,0"], runner: false }),
    );
    expect(s.log).toContainEqual(
      expect.objectContaining({ event: "defeated", cells: ["0,1"], runner: true }),
    );
    expect(s.log).toContainEqual({ cells: ["1,0", "0,1"] });
    expect(s.payouts).toEqual([
      { hpId: "brh_a", generation: 3, viewer: "w_me", q: 1, r: 0 },
      { hpId: "brh_c", generation: 0, viewer: "w_me", q: 0, r: 1 },
    ]);
    expect(s.log.at(-1)).toEqual({ sent: OP });
  });
});

describe("повтор нажатия", () => {
  it("тот же итог, второго взрыва и второй рассылки нет", async () => {
    const first = await throwIt({ data });
    const logged = s.log.length;
    const again = await throwIt({ data });
    expect(s.blastCalls).toHaveLength(1);
    expect(s.log).toHaveLength(logged);
    expect(again).toMatchObject({
      mines: first.mines,
      hits: first.hits,
      kills: first.kills,
      rewards: [],
    });
    expect(s.spends).toHaveLength(1);
  });

  it("ответ потерялся после коммита — судит ключ, рассылка идёт, взрыв один", async () => {
    s.commitThenLose = true;
    const res = await throwIt({ data });
    expect(res).toMatchObject({ ok: true, mines: 1, decor: 2 });
    expect(s.blastCalls).toHaveLength(1);
    expect(s.log.at(-1)).toEqual({ sent: OP });
  });

  it("повтор после коммита без рассылки — рассылает, но не взрывает снова", async () => {
    s.ops.set(OP, { detail: structuredClone(BLAST), sent: false });
    await throwIt({ data });
    expect(s.blastCalls).toEqual([]);
    expect(idx((x) => x.event === "mine_blast")).toBeGreaterThanOrEqual(0);
    expect(s.spends).toEqual([]);
  });
});
