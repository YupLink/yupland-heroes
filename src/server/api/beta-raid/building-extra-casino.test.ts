// Постройка-казино на карте: входу через Google окно без «Играть» (владелец, 06.11.2026).
import { describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ tg: 0 as number | null }));
vi.mock("../../auth", () => ({ getSessionTgId: () => auth.tg }));

const { buildingExtra } = await import("./building-extra");
const casino = () =>
  buildingExtra({ effect: "casino", built: true, wallet: "p.near", mapId: "m", q: 0, r: 0, hero: null });

describe("казино на карте", () => {
  it("Google — постройка без действия казино", async () => {
    auth.tg = 2 ** 52 + 9;
    expect(await casino()).toBeNull();
  });

  it("Telegram и вход по кошельку — «Играть» на месте", async () => {
    for (const tg of [700000002, 2 ** 52 + 2 ** 51 + 9, null]) {
      auth.tg = tg;
      expect(await casino()).toEqual({ kind: "casino" });
    }
  });
});
