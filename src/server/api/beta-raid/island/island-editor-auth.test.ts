// Правка дизайнера на острове: объекты и настройки — только снять. Право
// god_map — любая карта, но не свой остров — без объектов и чужих построек.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  wallet: null as string | null,
  editor: false,
  right: false,
  god: false,
  mapId: "rmap_live",
  owns: false,
  sql: "",
}));
vi.mock("@/server/auth", () => ({
  getCurrentWallet: () => s.wallet,
  isAdminWallet: () => false,
  isCastleEditor: () => s.editor,
}));
vi.mock("@/server/admin-rights", () => ({
  walletHasRight: async (_w: string, r: string) => (r === "island_god" ? s.god : s.right),
}));
vi.mock("@/server/db/pg", () => ({ pg: { users: { findOne: async () => null } } }));
vi.mock("@/server/api/user-shared", () => ({ accountOf: async () => "acc_me" }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql = sql;
    return s.owns ? [{ ok: 1 }] : [];
  },
}));
vi.mock("../encounter-where", () => ({ myMapId: async () => s.mapId }));

const { designerPatch, liveMapPatch, requireGodAdmin, requireGodMap } =
  await import("./island-editor-auth");

beforeEach(() =>
  Object.assign(s, {
    wallet: null,
    editor: false,
    right: false,
    god: false,
    mapId: "rmap_live",
    owns: false,
  }),
);

const TOWN = new Set(["house"]);

describe("designerPatch", () => {
  it("ставить объект и настройки нельзя, снять — можно", () => {
    const out = designerPatch(
      {
        q: 1,
        r: 2,
        terrainId: "grass",
        objectId: "boss_x",
        objectConfig: { usdt: 5 },
        buildingConfig: { price: 1 },
        tier: 3,
        alive: true,
      } as never,
      TOWN,
    );
    expect(out).toEqual({ q: 1, r: 2, terrainId: "grass" });
    const clear = designerPatch(
      {
        q: 1,
        r: 2,
        objectId: null,
        objectConfig: null,
        buildingId: null,
        buildingConfig: null,
      } as never,
      TOWN,
    );
    expect(clear).toEqual({
      q: 1,
      r: 2,
      objectId: null,
      objectConfig: null,
      buildingId: null,
      buildingConfig: null,
    });
  });

  it("пустая настройка у живой шахты/сундука — не проходит (были бы мировые награды)", () => {
    const out = designerPatch(
      { q: 1, r: 2, objectConfig: null, buildingConfig: null } as never,
      TOWN,
    );
    expect(out).toEqual({ q: 1, r: 2 });
  });

  it("постройка — только городская", () => {
    expect(
      designerPatch({ q: 0, r: 0, buildingId: "house", buildingSkinId: "s" } as never, TOWN),
    ).toEqual({ q: 0, r: 0, buildingId: "house", buildingSkinId: "s" });
    expect(
      designerPatch({ q: 0, r: 0, buildingId: "gold_mine", buildingSkinId: "s" } as never, TOWN),
    ).toEqual({ q: 0, r: 0 });
  });

  it("блоки (group_id, масштаб) остаются", () => {
    const out = designerPatch({ q: 0, r: 0, groupId: "g1", iconScale: 1.2 } as never, TOWN);
    expect(out).toEqual({ q: 0, r: 0, groupId: "g1", iconScale: 1.2 });
  });
});

describe("requireGodMap", () => {
  it("без кошелька — отказ", async () => {
    await expect(requireGodMap()).rejects.toThrow(/Доступ запрещён/);
  });
  it("право god_map — любая карта, где стоит; свой остров отмечен", async () => {
    Object.assign(s, { wallet: "w", right: true });
    expect(await requireGodMap()).toEqual({ mapId: "rmap_live", admin: false, ownIsland: false });
    Object.assign(s, { mapId: "isle_abc", owns: true });
    expect(await requireGodMap()).toEqual({ mapId: "isle_abc", admin: false, ownIsland: true });
    s.owns = false;
    expect(await requireGodMap()).toMatchObject({ ownIsland: false });
  });
  it("дизайнер без права — только свой остров", async () => {
    Object.assign(s, { wallet: "w", editor: true });
    await expect(requireGodMap()).rejects.toThrow(/своём острове/);
    Object.assign(s, { mapId: "isle_abc", owns: true });
    expect(await requireGodMap()).toEqual({ mapId: "isle_abc", admin: false, ownIsland: true });
  });
});

describe("liveMapPatch", () => {
  const old = new Map<string, string | null>([
    ["0,0", "gold_mine"],
    ["1,0", "house"],
    ["2,0", null],
  ]);
  it("объекты не трогает вовсе, местность проходит", () => {
    expect(
      liveMapPatch(
        { q: 5, r: 5, terrainId: "grass", objectId: null, objectConfig: null } as never,
        old,
        TOWN,
      ),
    ).toEqual({ q: 5, r: 5, terrainId: "grass" });
  });
  it("шахту игрока не снести и не перекрыть; городскую и пустую клетку — можно", () => {
    expect(
      liveMapPatch({ q: 0, r: 0, buildingId: null, buildingConfig: null } as never, old, TOWN),
    ).toEqual({ q: 0, r: 0 });
    expect(liveMapPatch({ q: 0, r: 0, buildingId: "house" } as never, old, TOWN)).toEqual({
      q: 0,
      r: 0,
    });
    expect(liveMapPatch({ q: 1, r: 0, buildingId: null } as never, old, TOWN)).toEqual({
      q: 1,
      r: 0,
      buildingId: null,
    });
    expect(liveMapPatch({ q: 2, r: 0, buildingId: "house" } as never, old, TOWN)).toEqual({
      q: 2,
      r: 0,
      buildingId: "house",
    });
  });
});

describe("island_god — режим бога целиком, свой остров, без денег", () => {
  it("свой остров — как админ, но money=false; чужая карта — отказ", async () => {
    Object.assign(s, { wallet: "w", god: true, mapId: "isle_abc", owns: true });
    expect(await requireGodAdmin()).toEqual({ wallet: "w", mapId: "isle_abc", money: false });
    expect(await requireGodMap()).toEqual({
      mapId: "isle_abc",
      admin: true,
      ownIsland: true,
      money: false,
    });
    Object.assign(s, { mapId: "rmap_live", owns: false });
    await expect(requireGodAdmin()).rejects.toThrow(/Доступ запрещён/);
    Object.assign(s, { mapId: "isle_other", owns: false });
    await expect(requireGodAdmin()).rejects.toThrow(/Доступ запрещён/);
  });
  it("свой демо-остров — тоже свой: хозяин ищется и в raid_demo_island", async () => {
    Object.assign(s, { wallet: "w", god: true, mapId: "isle_demo", owns: true });
    expect(await requireGodAdmin()).toEqual({ wallet: "w", mapId: "isle_demo", money: false });
    expect(s.sql).toContain("FROM yuplink.raid_island");
    expect(s.sql).toContain("FROM yuplink.raid_demo_island");
    expect(s.sql).toContain("account_id = 'acc_me'");
  });
  it("без права — отказ", async () => {
    Object.assign(s, { wallet: "w", mapId: "isle_abc", owns: true });
    await expect(requireGodAdmin()).rejects.toThrow(/Доступ запрещён/);
  });
});
