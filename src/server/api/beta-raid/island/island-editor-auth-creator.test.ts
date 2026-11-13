// Режим бога креатора: только в своей или открытой ему работе (isle_cw_…),
// целиком и без денег; на остальных картах право creator ничего не даёт.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  wallet: "creator.near" as string | null,
  rights: new Set<string>(),
  mapId: "isle_cw_abc",
  seen: false,
  sql: [] as string[],
}));
vi.mock("@/server/auth", () => ({
  getCurrentWallet: () => s.wallet,
  isAdminWallet: () => false,
  isCastleEditor: () => false,
}));
vi.mock("@/server/admin-rights", () => ({
  walletHasRight: async (_w: string, r: string) => s.rights.has(r),
}));
vi.mock("@/server/db/pg", () => ({ pg: { users: { findOne: async () => null } } }));
vi.mock("@/server/api/user-shared", () => ({ accountOf: async () => "acc_me" }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return s.seen ? [{ ok: 1 }] : [];
  },
}));
vi.mock("../encounter-where", () => ({ myMapId: async () => s.mapId }));

const { requireDesigner, requireGodAdmin, requireGodMap } = await import("./island-editor-auth");

beforeEach(() =>
  Object.assign(s, {
    wallet: "creator.near",
    rights: new Set(["creator"]),
    mapId: "isle_cw_abc",
    seen: false,
    sql: [],
  }),
);

describe("креатор в режиме бога", () => {
  it("своя или открытая работа — режим бога целиком, без денег", async () => {
    s.seen = true;
    expect(await requireGodAdmin()).toEqual({
      wallet: "creator.near",
      mapId: "isle_cw_abc",
      money: false,
    });
    expect(await requireGodMap()).toMatchObject({
      mapId: "isle_cw_abc",
      admin: true,
      money: false,
    });
    // Видимость — по владельцу или открытому доступу этому аккаунту.
    expect(s.sql.join("\n")).toContain("raid_creator_share");
    expect(s.sql.join("\n")).toContain("'acc_me'");
  });

  it("чужая работа (не открыта) — отказ", async () => {
    await expect(requireGodAdmin()).rejects.toThrow(/Доступ запрещён/);
  });

  it("старые карты креатору закрыты: мир и чужой остров — отказ", async () => {
    s.seen = true;
    s.mapId = "rmap_live";
    await expect(requireGodAdmin()).rejects.toThrow(/Доступ запрещён/);
    s.mapId = "isle_other";
    await expect(requireGodAdmin()).rejects.toThrow(/Доступ запрещён/);
  });

  it("island_god без права creator в работу не пускает", async () => {
    s.seen = true;
    s.rights = new Set(["island_god"]);
    await expect(requireGodAdmin()).rejects.toThrow(/Доступ запрещён/);
  });

  it("справочники кисти креатору читать можно", async () => {
    expect(await requireDesigner()).toBe("creator.near");
  });
});
