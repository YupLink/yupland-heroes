// «Забрать сундук» × раненая охрана (владелец, 29.09.2026): охрана
// возвращается в рюкзак только целой, на полном HP; раненая исчезает вместе с
// сундуком, и игрок видит это строкой в окне подтверждения (woundedOk). Ранили
// между снимком и записью — план заново. Модель базы — src/test/chestPickupFake.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { count, resetPickup, s } from "@/test/chestPickupFake";

const M = vi.hoisted(() => "@/test/chestPickupFake");
vi.mock("@tanstack/react-start", async () => (await import(M)).reactStart);
vi.mock("@/server/api/beta-raid/chest/chest-pickup-sql", async () => (await import(M)).pickupSqlMock);
vi.mock("@/server/api/beta-raid/chest/chest-pickup-snap-sql", async () => (await import(M)).snapSqlMock);
vi.mock("@/server/db/mcpClient", async () => (await import(M)).mcp);
vi.mock("@/server/raidLive", async () => (await import(M)).raidLive);
vi.mock("@/server/api/beta-raid/econ/chest-note", async () => (await import(M)).chestNote);
vi.mock("@/server/api/beta-raid/econ/trade-journal", async () => (await import(M)).tradeJournal);
vi.mock("@/server/api/beta-raid/loot-bag/bag-sweep", async () => (await import(M)).bagSweep);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await import(M)).backpack);
vi.mock("@/server/api/beta-raid/chest/chest-row", async () => (await import(M)).chestRow);
vi.mock("@/server/api/beta-raid/open-pass/pass", async () => (await import(M)).pass);
vi.mock("@/server/api/beta-raid/open-pass/pass-sql", async () => (await import(M)).passSql);

const { pickUpChest } = await import("@/server/api/beta-raid/chest/chest-pickup");
type Res = { guard: boolean; taken: unknown[]; lost: unknown[] };
const pick = (op: string, confirm?: boolean, woundedOk?: boolean) =>
  (pickUpChest as unknown as (a: { data: object }) => Promise<Res>)({
    data: { q: 1, r: 2, op, confirm, woundedOk },
  });

beforeEach(resetPickup);

describe("раненая охрана не возвращается", () => {
  beforeEach(() => {
    s.guard = { tpl: "rbt_1", name: "Тролль", image: null, whole: false };
  });

  it("без подтверждения — окно с цифрами, ничего не тронуто", async () => {
    await expect(pick("op1abc")).rejects.toThrow("chest.last_confirm");
    expect(s.writes).toBe(0);
    expect(s.guard).not.toBeNull();
  });

  it("подтвердил, видя строку «ранена» — сундук в рюкзак, охрана исчезла", async () => {
    await expect(pick("op1abc", true, true)).resolves.toEqual({
      guard: false,
      taken: [],
      bagged: [],
      chestBagged: false,
      lost: [],
    });
    expect(count("custom:cst_mc")).toBe(1);
    expect(count("boss:rbt_1")).toBe(0);
    expect(s.guard).toBeNull();
  });

  it("подтвердил цифры, но строку «ранена» не видел — снова окно", async () => {
    await expect(pick("op1abc", true, false)).rejects.toThrow("chest.last_confirm");
    expect(s.writes).toBe(0);
  });

  it("старое окно (без woundedOk) — подтверждение считается за согласие", async () => {
    await expect(pick("op1abc", true)).resolves.toMatchObject({ guard: false });
    expect(count("boss:rbt_1")).toBe(0);
  });

  it("повтор того же нажатия — из журнала: охрана не вернулась", async () => {
    const first = await pick("op1abc", true, true);
    await expect(pick("op1abc", true, true)).resolves.toEqual(first);
    expect(s.writes).toBe(1);
  });
});

describe("охрану ранили под рукой", () => {
  it("целая в снимке, раненая к записи — план заново, без согласия не забираем", async () => {
    s.beforeWrite = () => {
      if (s.guard) s.guard.whole = false;
    };
    await expect(pick("op1abc")).rejects.toThrow("chest.last_confirm");
    expect(s.writes).toBe(0);
    expect(count("boss:rbt_1")).toBe(0);
    expect(s.chests["1,2"]).toBe("acc_o");
  });

  it("с согласием — ячейка под охрану не занята, раненая не вернулась", async () => {
    s.beforeWrite = () => {
      if (s.guard) s.guard.whole = false;
    };
    await expect(pick("op1abc", true, true)).resolves.toMatchObject({ guard: false });
    expect(count("boss:rbt_1")).toBe(0);
    expect(s.writes).toBe(1);
  });
});
