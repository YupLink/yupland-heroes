// Остров встречает новичка: только при включённом выключателе и только того, у
// кого острова ещё не было; сбой создания — не ошибка начала игры.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  setting: { on: true } as unknown,
  row: null as unknown,
  entered: [] as Array<[string, string]>,
  enterThrows: false,
  afterRow: null as unknown,
  pos: null as unknown,
  dropped: [] as string[],
  loads: 0,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) =>
    sql.includes("island_newbies") && s.setting !== undefined ? [{ value: s.setting }] : [],
}));
vi.mock("./island-row", () => ({
  // Первый взгляд — до входа (острова нет), дальше — что осталось после попытки.
  loadIsland: async () => (s.loads++ === 0 ? s.row : (s.afterRow ?? s.row)),
  isLive: (r: { mapId?: string | null } | null) => !!r?.mapId,
}));
vi.mock("./island-move", () => ({ positionOf: async () => s.pos }));
vi.mock("./island-create", () => ({
  dropIsland: async (mapId: string) => void s.dropped.push(mapId),
}));
vi.mock("./island-admin", () => ({
  enterIsland: async (wallet: string, account: string) => {
    if (s.enterThrows) throw new Error("island.move_failed");
    s.entered.push([wallet, account]);
    return { ok: true, map: "isle_new" };
  },
}));

const { greetNewbie, islandNewbiesOn } = await import("./island-newbie");

beforeEach(() => {
  Object.assign(s, {
    setting: { on: true },
    row: null,
    entered: [],
    enterThrows: false,
    afterRow: null,
    pos: null,
    dropped: [],
    loads: 0,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("выключатель island_newbies", () => {
  it("on: true — включено (и строкой JSON тоже)", async () => {
    expect(await islandNewbiesOn()).toBe(true);
    s.setting = '{"on": true}';
    expect(await islandNewbiesOn()).toBe(true);
  });
  it("нет строки, on не true или мусор — выключено", async () => {
    for (const v of [null, { on: false }, { on: "true" }, "мусор", []]) {
      s.setting = v;
      expect(await islandNewbiesOn()).toBe(false);
    }
  });
});

describe("greetNewbie", () => {
  it("новичок без острова — на свой остров", async () => {
    expect(await greetNewbie("acc_new", "tg42")).toBe(true);
    expect(s.entered).toEqual([["tg42", "acc_new"]]);
  });
  it("выключено — в основной мир, острова нет", async () => {
    s.setting = { on: false };
    expect(await greetNewbie("acc_new", "tg42")).toBe(false);
    expect(s.entered).toEqual([]);
  });
  it("остров уже был (строка raid_island) — не трогаем", async () => {
    s.row = { accountId: "acc_new", mapId: null };
    expect(await greetNewbie("acc_new", "tg42")).toBe(false);
    expect(s.entered).toEqual([]);
  });
  it("остров не создался — false без ошибки (начало игры важнее)", async () => {
    s.enterThrows = true;
    expect(await greetNewbie("acc_new", "tg42")).toBe(false);
    expect(s.dropped).toEqual([]);
  });
  it("остров создан, а герой не встал — снести, false", async () => {
    s.enterThrows = true;
    s.afterRow = { mapId: "isle_half" };
    s.pos = { mapId: "beta_main", q: 1, r: 1 };
    expect(await greetNewbie("acc_new", "tg42")).toBe(false);
    expect(s.dropped).toEqual(["isle_half"]);
  });
  it("герой уже на острове, упал хвост входа — встретил, true, не сносим", async () => {
    s.enterThrows = true;
    s.afterRow = { mapId: "isle_ok" };
    s.pos = { mapId: "isle_ok", q: 24, r: 26 };
    expect(await greetNewbie("acc_new", "tg42")).toBe(true);
    expect(s.dropped).toEqual([]);
  });
});
