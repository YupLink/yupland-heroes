// Мягкая тяга барабанов (reelLevel.ts) на тестовых данных в боевой базе: спин
// настоящим slot-core ставит цель по прошлой игре, она пишется в slot_session и
// не уходит в браузер. Аккаунт zz_e2e_reels, уборка до и после.
// Запуск: E2E_PROD=1 npx vitest run --config vitest.e2e.config.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", async () => ({
  mcpExec: (await import("./prodDb")).mcpExecViaPsql,
}));
vi.mock("@/server/db/pg", async () => ({ sb: (await import("./prodDb")).sbViaPsql }));

import { num, one, runSql } from "./prodDb";
import { initialSlotState, EMPTY_STATS } from "@/lib/slot/state";

const RUN = process.env.E2E_PROD === "1";
const d = RUN ? describe : describe.skip;
const ACC = "zz_e2e_reels";

function cleanup(): void {
  runSql(`
    DELETE FROM yuplink.slot_session WHERE account_id = '${ACC}';
    DELETE FROM yuplink.res_ledger WHERE account_id = '${ACC}';
    DELETE FROM yuplink.account_resources WHERE account_id = '${ACC}';
    DELETE FROM yuplink.account_achievement WHERE account_id = '${ACC}';`);
}

beforeAll(() => {
  if (RUN) cleanup();
});
afterAll(() => {
  if (!RUN) return;
  cleanup();
  expect(
    num(`SELECT (SELECT count(*) FROM yuplink.slot_session WHERE account_id='${ACC}')
      + (SELECT count(*) FROM yuplink.res_ledger WHERE account_id='${ACC}')
      + (SELECT count(*) FROM yuplink.account_resources WHERE account_id='${ACC}')
      + (SELECT count(*) FROM yuplink.account_achievement WHERE account_id='${ACC}');`),
  ).toBe(0);
});

d("мягкая тяга", () => {
  it("спин: цель по прошлой игре в базе, браузеру не видна", async () => {
    const { slotActFor } = await import("@/server/api/slot/slot-core");
    runSql(`SELECT * FROM yuplink.res_move('${ACC}','gold',1000,'e2e_seed','${ACC}:seed');`);
    // Прошлая игра: 100 спинов, поставлено 900, получено 100 — отдача 11 %.
    const state = {
      ...initialSlotState(0),
      sid: "e2ereels",
      stats: { ...EMPTY_STATS, spins: 100, wagered: 900, won: 100 },
    };
    runSql(`INSERT INTO yuplink.slot_session (account_id, state, version)
      VALUES ('${ACC}', '${JSON.stringify(state)}'::jsonb, 1);`);
    const v = await slotActFor(ACC, { type: "spin", lines: 9, bet: 1 }, 1);
    expect(v.version).toBe(2);
    expect(JSON.stringify(v)).not.toContain('"reels"');
    const reels = JSON.parse(
      one(`SELECT state->'reels' FROM yuplink.slot_session WHERE account_id='${ACC}';`),
    ) as { at: number; set: number; safe: number; cap: number; stake: number; edge: number };
    // Отдача 11 % — долг 70 ставок: цель щедрее «90 % для умного».
    expect(reels).toMatchObject({ at: 100, cap: 9, stake: 9, edge: 0 });
    expect(reels.set).toBeGreaterThan(reels.safe);
    // Ачивка оборота пишется вдогонку — дождаться, чтобы уборка её застала.
    for (let i = 0; i < 30; i++) {
      if (num(`SELECT count(*) FROM yuplink.account_achievement WHERE account_id='${ACC}';`)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
  });
});
