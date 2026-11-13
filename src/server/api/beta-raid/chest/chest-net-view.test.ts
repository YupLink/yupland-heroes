// Окно владельца сундука (getChestNet) во время выката: у стопок рюкзака —
// movable («сколько можно положить», собранное без изношенного) и то же число
// прежним именем mob — вкладка, открытая до v30, читает его и не гасит плитки.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";

const s = vi.hoisted(() => ({ actor: "acc_o", open: true, net: [] as unknown[] }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({
    heroId: "h1",
    heroName: "Лучник",
    capacity: 6,
    potionCapacity: 0,
  }),
}));
vi.mock("@/server/api/beta-raid/mine-guard-read", () => ({
  loadGuardRow: async () => null,
  guardViewIfAlive: () => null,
}));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  chestActor: async () => ({ wallet: "w1", mapId: "rmap_x", account: s.actor }),
  chestNearAny: async (a: { account: string }) => ({
    chest: { owner_account: "acc_o" },
    mine: a.account === "acc_o",
  }),
}));
vi.mock("@/server/api/beta-raid/open-pass/pass", () => ({ passOpen: async () => s.open }));
vi.mock("@/server/api/beta-raid/chest/chest-store", () => ({ storeToChest: () => {} }));
vi.mock("@/server/api/beta-raid/chest/chest-take", () => ({ takeFromChest: () => {} }));
vi.mock("@/server/api/beta-raid/chest/chest-net-read", () => ({
  loadNet: async () => s.net,
  bagOccupied: () => 2,
  loadBag: async () => [
    {
      stackKey: "custom:banana",
      kind: "custom",
      name: "Банан",
      image: null,
      count: 25,
      movable: 12,
      potion: false,
    },
    {
      stackKey: "custom:wheat",
      kind: "custom",
      name: "Пшеница",
      image: null,
      count: 7,
      movable: 0,
      potion: false,
    },
  ],
}));

const { getChestNet } = await import("@/server/api/beta-raid/chest/chest-net");
type View = {
  backpack: { stacks: Array<{ stackKey: string; movable: number; mob?: number }> };
  slots: unknown[];
  locked?: boolean;
  price?: number;
  foreign?: boolean;
};

const open = () =>
  (getChestNet as unknown as (a: { data: object }) => Promise<View>)({ data: { q: 1, r: 2 } });

beforeEach(() => {
  s.actor = "acc_o";
  s.open = true;
  s.net = [];
});

describe("getChestNet: стопки рюкзака", () => {
  it("movable и прежнее имя mob — одно и то же число", async () => {
    const view = await open();
    expect(view.backpack.stacks.map((s) => [s.stackKey, s.movable, s.mob])).toEqual([
      ["custom:banana", 12, 12],
      ["custom:wheat", 0, 0],
    ]);
  });
});

describe("getChestNet: вход и чужой (§8.23, поправки 30.09)", () => {
  it("без входа — ни сети, ни рюкзака: закрыт и цена; пустая сеть — 1", async () => {
    s.open = false;
    const view = await open();
    expect(view).toMatchObject({ locked: true, price: 1, slots: [], foreign: false });
    expect(view.backpack.stacks).toEqual([]);
  });

  it("цена — занятые ячейки сети хозяина (две полные и хвост — 3), то же спишет «Открыть»", async () => {
    s.open = false;
    const count = 2 * CELL_SIZE + 5;
    s.net = [{ stackKey: "custom:ore", kind: "custom", name: "Руда", image: null, count }];
    await expect(open()).resolves.toMatchObject({ locked: true, price: 3 });
  });

  it("чужой внутри входа — видит сеть и кладёт собранное, как хозяин", async () => {
    s.actor = "acc_t";
    const view = await open();
    expect(view.foreign).toBe(true);
    expect(view.backpack.stacks.map((x) => [x.movable, x.mob])).toEqual([
      [12, 12],
      [0, 0],
    ]);
  });
});
