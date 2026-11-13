// «Корона гречневого королевства» на тестовых данных в боевой базе: настоящие
// bwCore / bwRating и функции buckwheat_start / buckwheat_step (migrations/buckwheat-01.sql).
// Аккаунт zz_e2e_buckwheat, за собой всё убирает.
// Запуск: E2E_PROD=1 npx vitest run --config vitest.e2e.config.ts src/test/e2e/buckwheat.e2e.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", async () => ({
  mcpExec: (await import("./prodDb")).mcpExecViaPsql,
}));
vi.mock("@/server/db/pg", async () => ({ sb: (await import("./prodDb")).sbViaPsql }));

import { num, runSql } from "./prodDb";
import { COLS, ROWS, canSwap } from "../../../minigames/buckwheat/src/engine.mjs";
import type { Move } from "@/server/api/buckwheat/bwEngine";

const RUN = process.env.E2E_PROD === "1";
const d = RUN ? describe : describe.skip;
const ACC = "zz_e2e_buckwheat";
/** Кто играет: тестовый аккаунт на золото, без кошелька и без DARAI. */
const WHO = { account: ACC, mode: "gold" as const, wallet: null, darai: false };

function cleanup(): void {
  runSql(`
    DELETE FROM yuplink.buckwheat_game WHERE account_id = '${ACC}';
    DELETE FROM yuplink.buckwheat_stats WHERE account_id = '${ACC}';
    DELETE FROM yuplink.res_ledger WHERE account_id = '${ACC}';
    DELETE FROM yuplink.account_resources WHERE account_id = '${ACC}';`);
}
const gold = () =>
  num(
    `SELECT coalesce((SELECT amount FROM yuplink.account_resources WHERE account_id='${ACC}' AND resource='gold'),0);`,
  );
const seedGold = (n: number, tag: string) =>
  runSql(`SELECT * FROM yuplink.res_move('${ACC}','gold',${n},'e2e_seed','${ACC}:${tag}');`);

function moveOn(board: number[][], skip: number): Move {
  const all: Move[] = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      for (const [r2, c2] of [
        [r, c + 1],
        [r + 1, c],
      ])
        if (r2 < ROWS && c2 < COLS && canSwap(board, { row: r, col: c }, { row: r2, col: c2 }))
          all.push([r, c, r2, c2]);
  if (!all.length) throw new Error("нет хода");
  return all[skip % all.length];
}

beforeAll(() => {
  if (RUN) cleanup();
});
afterAll(() => {
  if (!RUN) return;
  cleanup();
  expect(
    num(`SELECT (SELECT count(*) FROM yuplink.buckwheat_game WHERE account_id='${ACC}')
      + (SELECT count(*) FROM yuplink.buckwheat_stats WHERE account_id='${ACC}')
      + (SELECT count(*) FROM yuplink.res_ledger WHERE account_id='${ACC}')
      + (SELECT count(*) FROM yuplink.account_resources WHERE account_id='${ACC}');`),
  ).toBe(0);
});

d("«Корона гречневого королевства» на золото", () => {
  it("старт списывает вход один раз; вторая попытка продолжает ту же партию", async () => {
    const core = await import("@/server/api/buckwheat/bwCore");
    seedGold(250, "a");
    const init = await core.loadFor(WHO);
    expect(init).toMatchObject({ gold: 250, game: null, entry: 100 });
    const first = await core.startFor(WHO);
    expect(first.gold).toBe(150);
    expect(first.game?.count).toBe(0);
    const again = await core.startFor(WHO);
    expect(again.game?.id).toBe(first.game?.id);
    expect(gold()).toBe(150);
  });

  it("партия до конца: ходы на сервере, выплата за короны, копилка, журнал", async () => {
    const core = await import("@/server/api/buckwheat/bwCore");
    const init = await core.loadFor(WHO);
    const id = init.game!.id;
    let state = init.game!.state;
    let count = init.game!.count;
    let last: Awaited<ReturnType<typeof core.moveFor>> | null = null;
    await expect(core.moveFor(ACC, id, count + 1, [0, 0, 0, 1])).rejects.toThrow("bw.version");
    for (let i = 0; i < 40 && !last?.settlement; i++) {
      last = await core.moveFor(ACC, id, count, moveOn(state.board, i * 5 + 1));
      expect(last.valid).toBe(true);
      expect(last.count).toBe(count + 1);
      count = last.count;
      state = last.state;
    }
    const s = last!.settlement!;
    expect(s.returned).toBe(last!.finale!.state.crowns * 50);
    expect(last!.gold).toBe(150 + s.returned);
    expect(gold()).toBe(150 + s.returned);
    expect(last!.totals).toMatchObject({ games: 1, crowns: last!.finale!.state.crowns });
    expect(last!.totals?.grecha).toBe(last!.finale!.state.grecha);
    const ledger = runSql(
      `SELECT kind||':'||delta::int FROM yuplink.res_ledger WHERE account_id='${ACC}' AND ref LIKE 'bw:${id}:%' ORDER BY kind;`,
    );
    expect(ledger).toEqual(
      s.returned > 0
        ? ["buckwheat_stake:-100", `buckwheat_win:${s.returned}`]
        : ["buckwheat_stake:-100"],
    );
    await expect(core.moveFor(ACC, id, count, [0, 0, 0, 1])).rejects.toThrow("bw.done");
  });

  it("«Выйти» посреди партии: выплата за опущенные, вторая партия в копилке", async () => {
    const core = await import("@/server/api/buckwheat/bwCore");
    const before = gold();
    const start = await core.startFor(WHO);
    expect(start.gold).toBe(before - 100);
    const m = await core.moveFor(ACC, start.game!.id, 0, moveOn(start.game!.state.board, 3));
    const res = await core.exitFor(ACC, start.game!.id, m.count);
    expect(res.settlement.returned).toBe(m.state.crowns * 50);
    expect(res.gold).toBe(before - 100 + res.settlement.returned);
    expect(res.totals.games).toBe(2);
    expect((await core.loadFor(WHO)).game).toBeNull();
  });

  it("рейтинг видит аккаунт; без золота на вход — отказ, ничего не списано", async () => {
    const core = await import("@/server/api/buckwheat/bwCore");
    const { ratingFor } = await import("@/server/api/buckwheat/bwRating");
    const r = await ratingFor(ACC);
    expect(r.grecha.some((row) => row.own)).toBe(true);
    expect(r.crowns.some((row) => row.own)).toBe(true);
    const left = gold();
    runSql(
      `SELECT * FROM yuplink.res_move('${ACC}','gold',${-(left - 50)},'e2e_seed','${ACC}:drain');`,
    );
    await expect(core.startFor(WHO)).rejects.toThrow("bw.not_enough");
    expect(gold()).toBe(50);
    expect((await core.loadFor(WHO)).game).toBeNull();
  });
});

d("«Корона гречневого королевства» на фантики (§8.120)", () => {
  it("демо: пропуск 100 золота раз, ходы, «Выйти» — ни выплаты, ни копилки", async () => {
    const core = await import("@/server/api/buckwheat/bwCore");
    cleanup();
    await expect(core.startFor({ ...WHO, mode: "demo" })).rejects.toThrow("bw.not_enough");
    seedGold(150, "pass");
    expect((await core.loadFor({ ...WHO, mode: "demo" })).pass).toBe(false);
    const start = await core.startFor({ ...WHO, mode: "demo" });
    expect(start.demo).toBe(true);
    expect(start.pass).toBe(true);
    expect(gold()).toBe(50);
    expect(start.game?.count).toBe(0);
    const m = await core.moveFor(ACC, start.game!.id, 0, moveOn(start.game!.state.board, 2));
    expect(m.valid).toBe(true);
    const m2 = await core.moveFor(ACC, start.game!.id, m.count, moveOn(m.state.board, 4));
    expect(m2.count).toBe(2);
    const res = await core.exitFor(ACC, start.game!.id, m2.count);
    expect(res.totals.games).toBe(0);
    expect(gold()).toBe(50);
    const again = await core.startFor({ ...WHO, mode: "demo" });
    expect(again.game?.count).toBe(0);
    expect(gold()).toBe(50);
    expect(
      runSql(`SELECT kind FROM yuplink.res_ledger WHERE account_id='${ACC}' ORDER BY kind;`),
    ).toEqual(["buckwheat_pass", "e2e_seed"]);
  });
});
