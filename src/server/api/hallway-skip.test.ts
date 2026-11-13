// Стартовый набор новичка: владелец (аккаунт) заводится ДО выдачи и пишется
// в строки явно — иначе триггер stamp_acc видел users.account_id = NULL, и
// фишки оставались ничьими (120 строк / 38 аккаунтов на проде к 20.09).
// С 06.10.2026 в наборе 10 фишек; героя с 22.10 здесь не дают — новичок
// выбирает расу в меню входа («Начать игру», game-start).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const inserted: Record<string, Row[]> = { hallway_yupiks: [], hallway_training_chips: [] };
const order: string[] = [];
const state = {
  accountId: "acc_new" as string | null,
  resolveThrows: false,
  yupikByAccount: null as Row | null,
  yupikByWallet: null as Row | null,
  skipByWallets: [] as Row[],
  skipByAccount: [] as Row[],
  heroCalls: 0,
  islandOn: false,
};

/** Мини-билдер под `raw().select().eq()…` — запоминает фильтры, отдаёт данные по ним. */
function rawBuilder(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  const b: Record<string, unknown> = {};
  const chain = (op: string) => (col: string, val: unknown) => {
    filters.push([op, col, val]);
    return b;
  };
  for (const op of ["select", "eq", "in", "is", "order", "limit"]) b[op] = chain(op);
  b.then = (resolve: (v: { data: Row[] }) => void) => {
    let data: Row[] = [];
    if (table === "hallway_training_chips") {
      const byAcc = filters.some(([op, col]) => op === "eq" && col === "account_id");
      data = byAcc ? state.skipByAccount : state.skipByWallets;
    }
    resolve({ data });
  };
  return b;
}

vi.mock("../db/pg", () => ({
  pg: {
    hallwayYupiks: {
      findOne: vi.fn(async (f: Row) => {
        order.push("yupik.findOne");
        if ("account_id" in f) return state.yupikByAccount;
        if ("wallet" in f) return state.yupikByWallet;
        return null;
      }),
      insert: vi.fn(async (row: Row) => {
        order.push("yupik.insert");
        inserted.hallway_yupiks.push(row);
      }),
      update: vi.fn(async () => {}),
      raw: () => rawBuilder("hallway_yupiks"),
    },
    hallwayTrainingChips: {
      insert: vi.fn(async (row: Row) => {
        order.push("chip.insert");
        inserted.hallway_training_chips.push(row);
      }),
      raw: () => rawBuilder("hallway_training_chips"),
    },
    users: { findMany: vi.fn(async () => [{ wallet: "tg42" }]) },
  },
}));

vi.mock("./beta-raid/island/island-newbie", () => ({
  islandNewbiesOn: vi.fn(async () => state.islandOn),
}));

vi.mock("./starter-kit", () => ({
  grantStarterHero: vi.fn(async () => {
    state.heroCalls++;
    return true;
  }),
}));

vi.mock("./user-claims-core", () => ({
  resolveAccountId: vi.fn(async () => {
    order.push("resolveAccountId");
    if (state.resolveThrows) throw new Error("мост к базе лёг");
    return state.accountId;
  }),
}));

const {
  skipHallwayForNewPlayer,
  SKIP_CHIP_COUNT,
  SKIP_CHIP_SOURCE,
  STARTER_TOPUP_SOURCE,
  isStarterChip,
} = await import("./hallway-skip");

beforeEach(() => {
  inserted.hallway_yupiks = [];
  inserted.hallway_training_chips = [];
  order.length = 0;
  state.accountId = "acc_new";
  state.resolveThrows = false;
  state.yupikByAccount = null;
  state.yupikByWallet = null;
  state.skipByWallets = [];
  state.skipByAccount = [];
  state.heroCalls = 0;
  state.islandOn = false;
});

describe("skipHallwayForNewPlayer", () => {
  it("аккаунт заводится до выдачи, юпик и фишки помечены им", async () => {
    const r = await skipHallwayForNewPlayer("tg42", 42);
    expect(SKIP_CHIP_COUNT).toBe(10);
    expect(r).toEqual({ released: true, chips: SKIP_CHIP_COUNT });
    expect(order[0]).toBe("resolveAccountId");
    expect(order.indexOf("resolveAccountId")).toBeLessThan(order.indexOf("yupik.insert"));
    expect(inserted.hallway_yupiks[0].account_id).toBe("acc_new");
    expect(inserted.hallway_training_chips).toHaveLength(SKIP_CHIP_COUNT);
    for (const c of inserted.hallway_training_chips) {
      expect(c.account_id).toBe("acc_new");
      expect(c.source).toBe(SKIP_CHIP_SOURCE);
      expect(c.wallet).toBe("tg42");
    }
  });

  it("резолв аккаунта упал — набор всё равно выдаётся (второго вызова не будет)", async () => {
    state.resolveThrows = true;
    const r = await skipHallwayForNewPlayer("tg42", 42);
    expect(r.chips).toBe(SKIP_CHIP_COUNT);
    expect(inserted.hallway_training_chips.every((c) => !("account_id" in c))).toBe(true);
    expect("account_id" in inserted.hallway_yupiks[0]).toBe(false);
  });

  it("остров встречает новичков — 10 стартовых фишек не выдаём (§8.47)", async () => {
    state.islandOn = true;
    const r = await skipHallwayForNewPlayer("tg42", 42);
    expect(r).toEqual({ released: true, chips: 0 });
    expect(inserted.hallway_training_chips).toHaveLength(0);
    expect(inserted.hallway_yupiks).toHaveLength(1);
  });

  it("у аккаунта уже есть набор — второй не выдаём, даже без Telegram", async () => {
    state.skipByAccount = [{ id: "htc_old" }];
    const r = await skipHallwayForNewPlayer("wallet.near", null);
    expect(r.chips).toBe(0);
    expect(inserted.hallway_training_chips).toHaveLength(0);
  });

  it("героя при создании не выдаём: его выбирают в меню «Начать игру»", async () => {
    await skipHallwayForNewPlayer("tg42", 42);
    expect(state.heroCalls).toBe(0);
  });

  it("юпик аккаунта уже есть (сестринский кош) — второй не заводим", async () => {
    state.yupikByAccount = { wallet: "old.near", released: true };
    const r = await skipHallwayForNewPlayer("new.near", 42);
    expect(inserted.hallway_yupiks).toHaveLength(0);
    expect(r.released).toBe(false);
    expect(r.chips).toBe(SKIP_CHIP_COUNT);
  });
});

describe("isStarterChip", () => {
  it("стартовые (пропуск и раздача до 10) — да, купленные и из сундука — нет", () => {
    expect(isStarterChip(SKIP_CHIP_SOURCE)).toBe(true);
    expect(isStarterChip(STARTER_TOPUP_SOURCE)).toBe(true);
    expect(isStarterChip("chest")).toBe(false);
    expect(isStarterChip(null)).toBe(false);
  });
});
