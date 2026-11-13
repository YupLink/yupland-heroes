// Партия на сервере: вход списывается один раз (вторая вкладка продолжает ту же
// партию), ход записывается с номером, конец партии — выплата за короны, «Выйти»
// платит за уже опущенные; повтор запроса после потерянного ответа — тот же итог
// без второй записи. Партия в DARAI (08.11) — вход и выплата ×1000, в валюте партии.
// База подменена — проверяем, что и с чем зовём.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COLS, ROWS, canSwap, createGame } from "../../../../minigames/buckwheat/src/engine.mjs";
import type { Move } from "./bwEngine";
import type { BwWho } from "./bwCore";

type Cur = "gold" | "darai";
type G = {
  id: string;
  seed: number;
  salt: string;
  moves: Move[];
  done: boolean;
  stake: number;
  returned: number;
  grecha: number;
  currency: Cur;
};
const SALT = "ab".repeat(32);
const s = vi.hoisted(() => ({
  open: null as {
    id: string;
    seed: number;
    salt: string;
    moves: Move[];
    demo?: boolean;
    currency?: Cur;
  } | null,
  starts: [] as Array<{
    id: string;
    seed: number;
    salt: string;
    stake: number;
    demo: boolean;
    pass: number;
    currency: Cur;
    wallet: string | null;
  }>,
  steps: [] as Array<Record<string, unknown>>,
  game: null as G | null,
  failWrite: null as null | (() => void),
}));
vi.mock("./bwStore", () => ({
  loadAccount: async () => ({
    gold: 500,
    darai: 700000,
    totals: { crowns: 1, grecha: 2, games: 3 },
    open: s.open,
    pass: false,
  }),
  loadGame: async (_acc: string, id: string) => (s.game?.id === id ? { ...s.game } : null),
  startGame: async (
    _acc: string,
    id: string,
    seed: number,
    salt: string,
    stake: number,
    demo = false,
    pass = 0,
    currency: Cur = "gold",
    wallet: string | null = null,
  ) => {
    s.starts.push({ id, seed, salt, stake, demo, pass, currency, wallet });
    s.open = { id, seed, salt, moves: [], demo, currency };
    return 400;
  },
  writeStep: async (p: Record<string, unknown>) => {
    if (s.failWrite) {
      s.failWrite();
      throw new Error("bw.version");
    }
    s.steps.push(p);
    return 450;
  },
}));

const core = await import("./bwCore");
const who = (mode: "gold" | "demo" = "gold", darai = true): BwWho => ({
  account: "acc_a",
  mode,
  wallet: "w.near",
  darai,
});

/** Первый допустимый ход в начале партии. */
function firstMove(seed: number): Move {
  const g = createGame(seed);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [r2, c2] of [
        [r, c + 1],
        [r + 1, c],
      ])
        if (r2 < ROWS && c2 < COLS && canSwap(g.board, { row: r, col: c }, { row: r2, col: c2 }))
          return [r, c, r2, c2];
  throw new Error("нет хода");
}

const game = (over: Partial<G> = {}): G => ({
  id: "bw_g",
  seed: 5,
  salt: SALT,
  moves: [],
  done: false,
  stake: 100,
  returned: 0,
  grecha: 0,
  currency: "gold",
  ...over,
});

beforeEach(() =>
  Object.assign(s, { open: null, starts: [], steps: [], game: null, failWrite: null }),
);

describe("партия «Короны гречневого королевства»", () => {
  it("старт: вход из правил игры, зерно и соль — случайные и в ответ не идут", async () => {
    const init = await core.startFor(who());
    expect(s.starts).toHaveLength(1);
    expect(s.starts[0].stake).toBe(100);
    expect(s.starts[0].id).toMatch(/^bw_[A-Za-z0-9_-]{16}\.[0-9a-f]{12}$/);
    expect(s.starts[0].salt).toMatch(/^[0-9a-f]{64}$/);
    expect(init.game?.count).toBe(0);
    const text = JSON.stringify(init);
    expect(text).not.toContain(`"seed"`);
    expect(text).not.toContain(s.starts[0].salt);
  });

  it("фантики (08.11): демо-игрок — партия демо, своя открытая — в своём режиме", async () => {
    const init = await core.startFor(who("demo"));
    expect(s.starts[0].demo).toBe(true);
    expect(s.starts[0].pass).toBe(100);
    expect(init.demo).toBe(true);
    expect((await core.loadFor(who())).demo).toBe(true);
    s.open = null;
    expect((await core.loadFor(who())).demo).toBe(false);
    expect((await core.startFor(who())).demo).toBe(false);
    expect(s.starts[1].demo).toBe(false);
    expect(s.starts[1].pass).toBe(0);
  });

  it("незаконченная партия есть — второй раз вход не берём, продолжаем её", async () => {
    s.open = { id: "bw_existing_game_1", seed: 77, salt: SALT, moves: [] };
    const init = await core.startFor(who());
    expect(s.starts).toHaveLength(0);
    expect(init.game?.id).toBe("bw_existing_game_1");
  });

  it("ход: проверка номера, запись с ходом, без выплаты посреди партии", async () => {
    s.game = game();
    await expect(core.moveFor("acc_a", "bw_g", 3, [0, 0, 0, 1])).rejects.toThrow("bw.version");
    const m = firstMove(5);
    const res = await core.moveFor("acc_a", "bw_g", 0, m);
    expect(res.valid).toBe(true);
    expect(res.count).toBe(1);
    expect(s.steps[0]).toMatchObject({
      id: "bw_g",
      count: 0,
      moves: [m],
      done: false,
      returned: 0,
    });
  });

  it("неверный ход в базу не пишется", async () => {
    s.game = game();
    const res = await core.moveFor("acc_a", "bw_g", 0, [2, 2, 6, 6]);
    expect(res.valid).toBe(false);
    expect(res.count).toBe(0);
    expect(s.steps).toHaveLength(0);
  });

  it("повтор того же хода после потерянного ответа — тот же итог, второй записи нет", async () => {
    const m = firstMove(5);
    s.game = game();
    const first = await core.moveFor("acc_a", "bw_g", 0, m);
    s.game = game({ moves: [m] });
    const again = await core.moveFor("acc_a", "bw_g", 0, m);
    expect(again.state).toEqual(first.state);
    expect(again.count).toBe(1);
    expect(s.steps).toHaveLength(1);
  });

  it("запись прошла, а база ответила ошибкой (повтор моста) — ход засчитан", async () => {
    const m = firstMove(5);
    s.game = game();
    s.failWrite = () => {
      s.game = game({ moves: [m] });
    };
    const res = await core.moveFor("acc_a", "bw_g", 0, m);
    expect(res.valid).toBe(true);
    expect(res.count).toBe(1);
  });

  it("чужая или законченная партия — отказ", async () => {
    await expect(core.moveFor("acc_a", "bw_none", 0, [0, 0, 0, 1])).rejects.toThrow("bw.no_game");
    s.game = game({ done: true });
    await expect(core.moveFor("acc_a", "bw_g", 0, [0, 0, 0, 1])).rejects.toThrow("bw.done");
  });

  it("«Выйти»: партия закрыта, выплата — за опущенные короны (тут ноль)", async () => {
    s.game = game();
    const res = await core.exitFor("acc_a", "bw_g", 0);
    expect(res.settlement).toMatchObject({ entry: 100, returned: 0, net: -100 });
    expect(s.steps[0]).toMatchObject({ done: true, returned: 0, crowns: 0 });
    expect(res.gold).toBe(500);
  });

  it("повтор «Выйти» по уже рассчитанной партии — итог как записан, без записи", async () => {
    s.game = game({ done: true, returned: 50, grecha: 7 });
    const res = await core.exitFor("acc_a", "bw_g", 0);
    expect(res.settlement).toEqual({ entry: 100, returned: 50, net: -50, grecha: 7 });
    expect(s.steps).toHaveLength(0);
  });
});
