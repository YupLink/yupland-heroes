// Суточный тик города: едят, голод сразу, производство — всегда (голод закрывает лавки).
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  stock: {} as Record<string, number>,
  moves: [] as string[],
  starving: [] as boolean[],
  /** Утренний «до» из журнала: этот прогон — повтор того же дня. */
  replay: null as number | null,
}));

vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));
vi.mock("./town-resolve", () => ({ ensureTownSchema: async () => undefined }));
vi.mock("./town-stock", () => ({
  seedTownStock: async () => undefined,
  readTownStock: async () => ({ ...st.stock }),
  moveStock: async (
    _t: unknown,
    goodId: string,
    ref: string,
    m: { kind: string; need?: number; add?: number; ceil?: number },
  ) => {
    st.moves.push(ref);
    if (st.replay != null) return { before: st.replay, after: 0, fresh: false };
    const before = st.stock[goodId] ?? 0;
    const after =
      m.kind === "eat"
        ? Math.max(0, before - (m.need ?? 0))
        : Math.min(m.ceil ?? Infinity, before + (m.add ?? 0));
    st.stock[goodId] = after;
    return { before, after, fresh: true };
  },
}));
vi.mock("./town-state", async (orig) => ({
  ...(await orig<typeof import("./town-state")>()),
  setStarving: async (_t: unknown, on: boolean) => {
    st.starving.push(on);
  },
}));

import { tickTown } from "./town-cron";
import { defaultTownRules } from "@/lib/townRules";
import type { TownConfig } from "@/lib/townConfig";

const town = { mapId: "m", q: 1, r: 2 };
const cfg: TownConfig = {
  name: "",
  residents: 100,
  rules: defaultTownRules(),
  goods: [
    {
      id: "bread",
      kind: "custom",
      refId: "cst_bread",
      token: null,
      operation: "both",
      marketPrice: 1,
      consumePerResident: 0.1,
      producePerDay: 0,
    },
    {
      id: "wood",
      kind: "resource",
      refId: "wood",
      token: null,
      operation: "both",
      marketPrice: 1,
      consumePerResident: 0,
      producePerDay: 5,
    },
  ],
};

beforeEach(() => {
  st.stock = { bread: 100, wood: 50 };
  st.moves = [];
  st.starving = [];
  st.replay = null;
});

describe("тик города", () => {
  it("жители съели суточную норму, город произвёл своё", async () => {
    const res = await tickTown(town, cfg, false, "2026-10-03");
    expect(st.stock.bread).toBe(90);
    expect(st.stock.wood).toBe(55);
    expect(res.starving).toBe(false);
    expect(st.starving).toEqual([]);
    // Ключи с датой: второй прогон в те же сутки не повторит движение.
    expect(st.moves).toContain("tick:2026-10-03:m:1,2:bread:eat");
  });

  it("еды меньше суточной нормы — голод сразу, но производство идёт (закрываются только лавки)", async () => {
    st.stock.bread = 4;
    const res = await tickTown(town, cfg, false, "2026-10-03");
    expect(res.starving).toBe(true);
    expect(st.starving).toEqual([true]);
    expect(st.stock.bread).toBe(0);
    expect(st.stock.wood).toBe(55);
  });

  it("голодал, сегодня поел, но на завтра еды меньше суток — голод остаётся", async () => {
    st.stock.bread = 15;
    const res = await tickTown(town, cfg, true, "2026-10-03");
    expect(res.starving).toBe(true);
    expect(st.starving).toEqual([]);
  });

  it("окрестность добывает вдобавок к производству пульта; голодный добывает тоже", async () => {
    await tickTown(town, cfg, false, "2026-10-08", { cst_bread: 7, wood: 100 });
    expect(st.stock.bread).toBe(97);
    expect(st.stock.wood).toBe(55);
    st.stock.bread = 4;
    const res = await tickTown(town, cfg, false, "2026-10-09", { cst_bread: 7 });
    expect(res.starving).toBe(true);
    expect(st.stock.bread).toBe(7);
  });

  it("голодал, а еды после завтрака ещё на сутки — голод снят, производство пошло", async () => {
    st.stock.bread = 110;
    const res = await tickTown(town, cfg, true, "2026-10-03");
    expect(res.starving).toBe(false);
    expect(st.starving).toEqual([false]);
    expect(st.stock.wood).toBe(55);
  });

  it("повтор тика в те же сутки не морит голодом город, который уже накормили", async () => {
    // Утром еды было 4 из 10 — город голодал; днём привезли до нормы.
    st.replay = 4;
    st.stock.bread = 100;
    const res = await tickTown(town, cfg, true, "2026-10-03");
    expect(res.starving).toBe(false);
    expect(st.starving).toEqual([false]);
  });
});
