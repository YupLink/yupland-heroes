// «Забрать» DARAI-шахту поверх фейковой базы: проверки до записи (вплотную,
// DARAI, хозяин свою не поднимает, живая охрана — бой), цена захвата с
// множителем карты, отказы функции базы ключами словаря (в т. ч. «одно
// поднятие до размещения»), повтор нажатия без второй сытости, обрыв после
// коммита судит ключ, клетку узнают все.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  op: null as Record<string, unknown> | null,
  /** Ответы поиска ключа по очереди (пусто — s.op). */
  opQueue: [] as Array<Record<string, unknown> | null>,
  takeError: null as string | null,
  takeRes: { was: false, id: "dm_1", paid: 10 } as Record<string, unknown> | null,
  pos: { q: 10, r: 5 },
  building: { effect: "mine", tier: 0, tiers: [{}], config: {}, meta: {} } as Record<
    string,
    unknown
  > | null,
  guardAlive: false,
  owner: "acc_other" as string | null,
  satiety: 0,
  announced: [] as unknown[],
  notes: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/raid_dmine_take\(/.test(sql)) {
      if (s.takeError) throw new Error(s.takeError);
      if (s.takeRes)
        s.op = {
          op: "k",
          kind: "take",
          map_id: "rmap_1",
          q: 11,
          r: 5,
          dmine_id: s.takeRes.id,
          paid: s.takeRes.paid,
          sent: false,
        };
      return s.takeRes ? [{ res: s.takeRes }] : [];
    }
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/dmine/dmine-announce", () => ({
  loadDmineOp: async () => (s.opQueue.length > 0 ? s.opQueue.shift() : s.op),
  announceDmine: async (row: unknown) => {
    s.announced.push(row);
    return true;
  },
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w1.tg" }));
vi.mock("@/server/rateGate", () => ({ actionGate: async () => {} }));
vi.mock("@/server/api/beta-raid/encounter-where", async (orig) => ({
  ...(await orig<object>()),
  myMapId: async () => "rmap_1",
  playerCell: async () => s.pos,
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/api/beta-raid/building-action", () => ({
  loadCellBuilding: async () => s.building,
}));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_1" }));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 8, potionCapacity: 2 }),
}));
vi.mock("@/server/api/beta-raid/mine-guard-read", () => ({
  loadGuardRow: async () => null,
  guardAlive: () => s.guardAlive,
}));
vi.mock("@/server/api/beta-raid/mine-v2-read", () => ({
  loadMineCell: async () => ({ owner: s.owner }),
}));
vi.mock("@/server/api/beta-raid/hero-satiety", () => ({
  moveSatiety: async (_w: string, d: number) => {
    s.satiety += d;
  },
}));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({
  noteEnergySpend: async () => {
    s.notes += 1;
  },
}));

const { takeDaraiMine } = await import("./dmine-take");
const take = (data: Record<string, unknown> = {}) =>
  (takeDaraiMine as unknown as Fn)({ data: { q: 11, r: 5, op: "op123456", ...data } });
// Цена захвата клетки — не цена гриба: «Забрать» стоит 5 энергии всегда.
const darai = { resource: "token", token: "Darai", yield: 10000, captureCost: 15 };

beforeEach(() => {
  Object.assign(s, {
    op: null,
    takeError: null,
    takeRes: { was: false, id: "dm_1", paid: 5 },
    pos: { q: 10, r: 5 },
    building: { effect: "mine", tier: 0, tiers: [{}], config: darai, meta: {} },
    guardAlive: false,
    owner: "acc_other",
    satiety: 0,
    notes: 0,
  });
  s.sql.length = 0;
  s.announced.length = 0;
  s.opQueue.length = 0;
});

describe("takeDaraiMine", () => {
  it("взял: функция базы с ключом нажатия, 5 энергии и ёмкостью; клетку разослали", async () => {
    await expect(take()).resolves.toEqual({ ok: true, id: "dm_1", cost: 5 });
    const call = s.sql.find((x) => x.includes("raid_dmine_take("))!;
    expect(call).toContain("'dmtake:acc_1:op123456'");
    expect(call).toMatch(
      new RegExp(
        `'rmap_1', 11,\\s+5, 'acc_1', 'w1\\.tg', 'h1',\\s+8, ${CELL_SIZE}, 5, 'Гриб DARAI'`,
      ),
    );
    expect(s.satiety).toBe(-10);
    expect(s.notes).toBe(1);
    expect(s.announced).toHaveLength(1);
  });

  it("не вплотную, не DARAI, не построена — отказ до базы", async () => {
    s.pos = { q: 0, r: 0 };
    await expect(take()).rejects.toThrow("Подойди ближе");
    s.pos = { q: 10, r: 5 };
    s.building = { ...s.building!, config: { resource: "token", token: "magicdust", yield: 1 } };
    await expect(take()).rejects.toThrow("dmine.not_darai");
    s.building = { ...s.building!, config: darai, tier: 0, tiers: [{}, {}] };
    await expect(take()).rejects.toThrow("не построена");
    s.building = null;
    await expect(take()).rejects.toThrow("dmine.gone");
    expect(s.sql.some((x) => x.includes("raid_dmine_take("))).toBe(false);
  });

  it("хозяин свою не поднимает — отказ до базы и без энергии", async () => {
    s.owner = "acc_1";
    await expect(take()).rejects.toThrow("dmine.own");
    expect(s.sql.some((x) => x.includes("raid_dmine_take("))).toBe(false);
    expect(s.satiety).toBe(0);
  });

  it("живая охрана (след до выката) — сначала бой", async () => {
    s.guardAlive = true;
    await expect(take()).rejects.toThrow("braid.mine_guarded");
    expect(s.sql.some((x) => x.includes("raid_dmine_take("))).toBe(false);
  });

  it("поднимал её последним — отказ базы «одно поднятие», без сытости и заметки", async () => {
    s.takeError = "ERROR: dmine_once";
    await expect(take()).rejects.toThrow("dmine.once");
    s.takeError = "ERROR: dmine_own";
    await expect(take()).rejects.toThrow("dmine.own");
    expect(s.satiety).toBe(0);
    expect(s.notes).toBe(0);
  });

  it("повтор нажатия: прошлый итог, без второй сытости и без вызова базы", async () => {
    s.op = {
      op: "k",
      kind: "take",
      map_id: "rmap_1",
      q: 11,
      r: 5,
      dmine_id: "dm_1",
      paid: 5,
      sent: true,
    };
    await expect(take()).resolves.toEqual({ ok: true, id: "dm_1", cost: 5 });
    expect(s.sql.some((x) => x.includes("raid_dmine_take("))).toBe(false);
    expect(s.satiety).toBe(0);
    expect(s.announced).toHaveLength(0);
  });

  it("отказ базы — ключом словаря; без ключа нажатия ничего не начисляется", async () => {
    s.takeError = "ERROR: not_enough_energy";
    await expect(take()).rejects.toThrow('mineplace.no_energy|{"need":5}');
    s.takeError = "ERROR: dmine_room:0";
    await expect(take()).rejects.toThrow("market.backpack_need:1:0");
    expect(s.satiety).toBe(0);
  });

  it("обрыв после коммита: ключ лёг — ответ «взято», сытость один раз", async () => {
    s.takeError = "bridge timeout";
    s.opQueue.push(null);
    s.op = {
      op: "k",
      kind: "take",
      map_id: "rmap_1",
      q: 11,
      r: 5,
      dmine_id: "dm_9",
      paid: 5,
      sent: false,
    };
    await expect(take()).resolves.toEqual({ ok: true, id: "dm_9", cost: 5 });
    expect(s.satiety).toBe(-10);
    expect(s.announced).toHaveLength(1);
  });
});
