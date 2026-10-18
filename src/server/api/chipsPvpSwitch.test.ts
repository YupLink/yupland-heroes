// Выключатель ПвП фишек: без настройки — выключен; "true" — открыт;
// выключенный — создание и принятие вызова отказывают, отмена своего — работает.
import { beforeEach, describe, expect, it, vi } from "vitest";

const setting = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/pg", () => ({
  pg: {
    settings: {
      findOne: async () => (setting.value === null ? null : { value: setting.value }),
    },
    chipPvpBattles: { findOne: async () => null },
    chips: { findOne: async () => null },
  },
  sb: {},
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "w1" }));
vi.mock("../maintenance", () => ({ assertNotMaintenance: () => {} }));
vi.mock("./user", () => ({ getSisterWallets: async () => ["w1"] }));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc1" }));

const sw = await import("./chipsPvpSwitch");
const pvp = await import("./chipsPvp");
type Fn = (a: { data: unknown }) => Promise<unknown>;
const create = pvp.createPvpBattle as unknown as Fn;
const join = pvp.joinPvpBattle as unknown as Fn;
const cancel = pvp.cancelPvpBattle as unknown as Fn;

beforeEach(() => {
  setting.value = null;
  sw.resetPvpSwitchCache();
});

describe("выключатель ПвП фишек", () => {
  it("настройки нет или не «true» — выключен", async () => {
    expect(await sw.pvpEnabled()).toBe(false);
    sw.resetPvpSwitchCache();
    setting.value = "false";
    expect(await sw.pvpEnabled()).toBe(false);
  });

  it("«true» — открыт", async () => {
    setting.value = "true";
    expect(await sw.pvpEnabled()).toBe(true);
  });

  it("выключен: создать и принять вызов нельзя", async () => {
    await expect(create({ data: { chipIds: ["c1"] } })).rejects.toThrow(sw.PVP_OFF_MESSAGE);
    await expect(join({ data: { battleId: "b1", chipIds: ["c1"] } })).rejects.toThrow(
      sw.PVP_OFF_MESSAGE,
    );
  });

  it("выключен: отмена своего вызова не упирается в выключатель", async () => {
    // Вызова нет — отказ «Бой не найден», а не «ПвП выключен»: фишки забрать можно.
    await expect(cancel({ data: { battleId: "b1" } })).rejects.toThrow("Бой не найден");
  });

  it("открыт: создание идёт дальше выключателя", async () => {
    setting.value = "true";
    // Дальше — проверки фишек (здесь в заглушке их нет): важно, что не «выключен».
    const err = await create({ data: { chipIds: ["c1"] } }).catch((e: Error) => e);
    expect(String(err)).not.toContain(sw.PVP_OFF_MESSAGE);
  });
});
