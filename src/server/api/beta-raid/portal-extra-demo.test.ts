// Портал на демо-острове (копия образца несёт и его портал): выходов нет, окно
// честно говорит «некуда», и ачивки острова его не держат.
import { describe, expect, it, vi } from "vitest";

vi.mock("./portal-exits", () => ({ portalExits: async () => [], roomOf: () => ({ mapId: "isle_demo" }) }));
vi.mock("./portal-rooms", () => ({ roomNames: async () => ({}) }));

const { portalExtra } = await import("./portal-extra");
// Конфиг — как у портала, приехавшего с образца (группа 1, с 5-го уровня).
const cellConfig = { portal: { group: 1, prices: [], levelFrom: 5, levelFromOn: true, levelTo: 100, levelToOn: false } };
const base = { built: true, mapId: "isle_demo", q: 1, r: 2, heroLevel: 10, standingHere: false, cellConfig };

describe("портал демо-острова", () => {
  it("выходов нет — «некуда», пройти нельзя", async () => {
    const x = (await portalExtra({ ...base, demo: true, gateDone: 3 })) as { exits: number; can: boolean; reasonKey: string | null };
    expect(x.exits).toBe(0);
    expect(x.can).toBe(false);
    expect(x.reasonKey).toBe("braid.portal_alone");
  });

  it("остров новичка — по-прежнему один выход в мир", async () => {
    const x = (await portalExtra({ ...base, gateDone: null })) as { exits: number; can: boolean };
    expect(x.exits).toBe(1);
    expect(x.can).toBe(true);
  });
});
