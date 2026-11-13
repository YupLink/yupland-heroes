// Казино закрыто входу через Google (владелец, 06.11.2026): автомат и постройка
// казино в замке отказывают «slot.google» ещё до золота и ресурсов.
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ tg: 0 as number | null }));
vi.mock("@tanstack/react-start", () => {
  const chain = () => {
    const b: { inputValidator: (v: (d: unknown) => unknown) => typeof b; handler: (h: (a: { data: unknown }) => unknown) => (a?: { data?: unknown }) => unknown } = {
      inputValidator: (v) => { val = v; return b; },
      handler: (h) => (a) => h({ data: val ? val(a?.data) : a?.data }),
    };
    let val: ((d: unknown) => unknown) | null = null;
    return b;
  };
  return { createServerFn: chain };
});
vi.mock("../../auth", () => ({
  getCurrentWallet: () => "player.near",
  getSessionTgId: () => auth.tg,
  isAdminWallet: () => false,
  requireWallet: async () => "player.near",
}));
const core = vi.hoisted(() => ({ load: vi.fn(), build: vi.fn() }));
vi.mock("../beta-raid/gate", () => ({ requireBetaRaid: async () => "player.near" }));
vi.mock("../currency/move", () => ({ accAccountId: async () => "acc1" }));
vi.mock("./slot-core", () => ({
  slotLoadFor: async () => { core.load(); return { state: {}, version: 1, gold: 5 }; },
  slotActFor: vi.fn(),
  view: () => ({ ok: true }),
}));
vi.mock("../../db/pg", () => ({ sb: { rpc: async () => { core.build(); return { data: [{ built: true, applied: true }] }; } } }));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [{ built: false, resources: {} }] }));
vi.mock("../beta-raid/owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("../castle-townhall/townhall-buy", () => ({ assertCastleSlot: async () => undefined }));
vi.mock("../castle-townhall/free-build", () => ({ freeBuildCovers: async () => false }));
vi.mock("@/server/api/castle-townhall/townhall-state", () => ({ townHallError: (e: Error) => e }));

import { slotLoad } from "./slot-api";
import { buildCastleCasino, getCastleCasino } from "./castle-casino";

const GOOGLE = 2 ** 52 + 3;
const WALLET = 2 ** 52 + 2 ** 51 + 3;

beforeEach(() => { core.load.mockClear(); core.build.mockClear(); });

describe("казино и вход через Google", () => {
  it("Google — автомат не открывается, золото не читается", async () => {
    auth.tg = GOOGLE;
    await expect(slotLoad()).rejects.toThrow("slot.google");
    expect(core.load).not.toHaveBeenCalled();
  });

  it("Google — казино в замке не строится, ресурсы не списываются", async () => {
    auth.tg = GOOGLE;
    await expect(buildCastleCasino({ data: { opId: "op-12345678" } })).rejects.toThrow("slot.google");
    expect(core.build).not.toHaveBeenCalled();
  });

  it("Google — в замке казино нет: не построено и закрыто", async () => {
    auth.tg = GOOGLE;
    await expect(getCastleCasino()).resolves.toMatchObject({ built: false, closed: true, admin: false });
    auth.tg = 700000002;
    await expect(getCastleCasino()).resolves.toMatchObject({ closed: false });
  });

  it("Telegram и вход по кошельку — как раньше", async () => {
    for (const tg of [700000002, WALLET]) {
      auth.tg = tg;
      await expect(slotLoad()).resolves.toEqual({ ok: true });
      await expect(buildCastleCasino({ data: { opId: "op-12345678" } })).resolves.toEqual({ built: true, applied: true });
    }
  });
});
