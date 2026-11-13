// Партия в DARAI (владелец, 08.11.2026: «вход 100 000, корона 50 000»): те же правила,
// суммы ×1000, вход и выплата — в валюте партии, кошелёк сессии — в журнал счёта.
// Google-входу и демо DARAI закрыт. База подменена — проверяем, что и с чем зовём.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLS, ROWS, canSwap, type Game } from "../../../../minigames/buckwheat/src/engine.mjs";
import type { Move } from "./bwEngine";
import type { BwWho } from "./bwCore";

const SALT = "ab".repeat(32);
type Stored = { id: string; seed: number; salt: string; moves: Move[]; done: boolean };
const s = vi.hoisted(() => ({
  open: null as Record<string, unknown> | null,
  starts: [] as Array<Record<string, unknown>>,
  steps: [] as Array<Record<string, unknown>>,
  game: null as (Stored & Record<string, unknown>) | null,
}));
vi.mock("./bwStore", () => ({
  loadAccount: async () => ({
    gold: 500,
    darai: 700000,
    totals: { crowns: 0, grecha: 0, games: 0 },
    open: s.open,
    pass: false,
  }),
  loadGame: async (_a: string, id: string) => (s.game?.id === id ? { ...s.game } : null),
  startGame: async (...a: unknown[]) => {
    const [, id, seed, salt, stake, demo, pass, currency, wallet] = a;
    s.starts.push({ id, stake, demo, pass, currency, wallet });
    s.open = { id, seed, salt, moves: [], demo, currency };
    return 600000;
  },
  writeStep: async (p: Record<string, unknown>) => {
    s.steps.push(p);
    return 750000;
  },
}));

const core = await import("./bwCore");
const { replay, step, toCell } = await import("./bwEngine");
const who = (mode: "gold" | "demo" = "gold", darai = true): BwWho => ({
  account: "acc_a",
  mode,
  wallet: "w.near",
  darai,
});
const darai = (over: Partial<Stored> & Record<string, unknown> = {}) => ({
  id: "bw_g",
  seed: 5,
  salt: SALT,
  moves: [] as Move[],
  done: false,
  stake: 100000,
  returned: 0,
  grecha: 0,
  currency: "darai",
  demo: false,
  ...over,
});

function anyMove(g: Game): Move | null {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [r2, c2] of [
        [r, c + 1],
        [r + 1, c],
      ])
        if (r2 < ROWS && c2 < COLS && canSwap(g.board, { row: r, col: c }, { row: r2, col: c2 }))
          return [r, c, r2, c2];
  return null;
}

beforeEach(() => Object.assign(s, { open: null, starts: [], steps: [], game: null }));

describe("«Корона гречневого королевства» на DARAI", () => {
  it("вход 100 000 со счёта, кошелёк — в журнал; Google-входу и демо — закрыто", async () => {
    const init = await core.startFor(who(), "darai");
    expect(s.starts[0]).toMatchObject({
      stake: 100000,
      currency: "darai",
      wallet: "w.near",
      demo: false,
    });
    expect(init).toMatchObject({ darai: 700000, daraiOpen: true });
    expect(init.game?.currency).toBe("darai");
    s.open = null;
    await expect(core.startFor(who("gold", false), "darai")).rejects.toThrow("bw.closed");
    await expect(core.startFor(who("demo"), "darai")).rejects.toThrow("bw.closed");
    expect(s.starts).toHaveLength(1);
  });

  it("«Выйти» и итог — в DARAI (×1000), выплата пишется с кошельком", async () => {
    s.game = darai();
    const res = await core.exitFor("acc_a", "bw_g", 0, "w.near");
    expect(res.settlement).toMatchObject({ entry: 100000, returned: 0, net: -100000 });
    expect(s.steps[0]).toMatchObject({ done: true, returned: 0, wallet: "w.near" });
    expect(res.darai).toBe(700000);
    s.game = darai({ done: true, returned: 150000, grecha: 3 });
    const again = await core.exitFor("acc_a", "bw_g", 0);
    expect(again.settlement).toEqual({ entry: 100000, returned: 150000, net: 50000, grecha: 3 });
  });

  it("последний ход — выплата за короны ×1000", async () => {
    const moves: Move[] = [];
    for (let i = 0; i < 60; i++) {
      const m = anyMove(replay(5, SALT, moves));
      if (!m) break;
      const probe = step(replay(5, SALT, moves), toCell(m[0], m[1]), toCell(m[2], m[3]));
      if (probe.settlement) {
        s.game = darai({ moves: [...moves] });
        const res = await core.moveFor("acc_a", "bw_g", moves.length, m, "w.near");
        expect(res.settlement?.entry).toBe(100000);
        expect(res.settlement?.returned).toBe(probe.settlement.returned * 1000);
        expect(s.steps.at(-1)).toMatchObject({
          done: true,
          returned: probe.settlement.returned * 1000,
          wallet: "w.near",
        });
        return;
      }
      moves.push(m);
    }
    throw new Error("партия не кончилась");
  });
});
