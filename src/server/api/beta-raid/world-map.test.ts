// Ответ карты мира (ПРАВИЛА §8.32): без предмета «Карта» у выбранного героя —
// отказ ДО чтения карты, никому (ни владельцу, ни админу); с предметом —
// «Разведанное», «Вся карта» — с предметом и только админу.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  admin: false,
  owner: false,
  has: false,
  calls: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w_me" }));
vi.mock("@/server/auth", () => ({
  isAdminWallet: () => s.admin,
  isPayoutsAdminWallet: () => s.owner,
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./world-map-item", () => ({
  hasMapItem: async (account: string) => {
    s.calls.push(`item:${account}`);
    return s.has;
  },
}));
vi.mock("./encounter-where", () => ({
  playerMapId: async () => {
    s.calls.push("map-id");
    return "map_a";
  },
}));
vi.mock("./map-base", () => ({
  mapBase: async () => {
    s.calls.push("cells");
    return { cells: [{ q: 0, r: 0, terrain_id: "grass" }], terrains: [] };
  },
}));
vi.mock("./world-map-marks", () => ({
  worldMarks: async () => {
    s.calls.push("marks");
    return [];
  },
}));
vi.mock("./world-map-treasures", () => ({
  loadMyTreasures: async () => {
    s.calls.push("treasures");
    return [];
  },
}));
vi.mock("./world-map-seen", () => ({
  loadSeenIslands: async () => {
    s.calls.push("seen");
    return "0,0,1";
  },
}));

const { getWorldMap } = await import("./world-map");
type Handler = (a: { data: { mode: "seen" | "all" } }) => Promise<{ mode: string }>;
const open = (mode: "seen" | "all") => (getWorldMap as unknown as Handler)({ data: { mode } });

beforeEach(() => {
  Object.assign(s, { admin: false, owner: false, has: false, calls: [] });
});

describe("getWorldMap: доступ по предмету «Карта»", () => {
  it("без предмета — отказ до чтения карты: игроку, админу и владельцу", async () => {
    for (const who of [{}, { admin: true }, { admin: true, owner: true }, { owner: true }]) {
      Object.assign(s, { admin: false, owner: false, calls: [] }, who);
      for (const mode of ["seen", "all"] as const) {
        await expect(open(mode)).rejects.toThrow("wmap.no_access");
      }
      // Проверен только предмет выбранного героя — ни клеток, ни меток, ни кладов.
      expect(s.calls).toEqual(["item:acc_me", "item:acc_me"]);
    }
  });

  it("с предметом — «Разведанное»; «Вся карта» игроку — отказ до чтения", async () => {
    s.has = true;
    await expect(open("seen")).resolves.toMatchObject({ mode: "seen" });
    expect(s.calls[0]).toBe("item:acc_me");
    expect(s.calls).toEqual(
      expect.arrayContaining(["map-id", "cells", "marks", "treasures", "seen"]),
    );
    s.calls = [];
    await expect(open("all")).rejects.toThrow("wmap.no_access");
    expect(s.calls).toEqual(["item:acc_me"]);
  });

  it("админу и владельцу с предметом — и «Вся карта», без разведанного", async () => {
    for (const who of [{ admin: true }, { owner: true }]) {
      Object.assign(s, { admin: false, owner: false, has: true, calls: [] }, who);
      await expect(open("all")).resolves.toMatchObject({ mode: "all" });
      expect(s.calls).toContain("cells");
      expect(s.calls).not.toContain("seen");
    }
  });
});
