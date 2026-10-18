// Казино в замке: постройка за ресурсы на тестовых данных в боевой базе.
// Настоящие castleCasinoFor / buildCastleCasinoFor и функция базы castle_casino_build.
// Запуск: E2E_PROD=1 npx vitest run --config vitest.e2e.config.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", async () => ({
  mcpExec: (await import("./prodDb")).mcpExecViaPsql,
}));
vi.mock("@/server/db/pg", async () => ({ sb: (await import("./prodDb")).sbViaPsql }));

import { num, runSql } from "./prodDb";
import { CASINO_COST } from "@/lib/castleCasino";

const RUN = process.env.E2E_PROD === "1";
const d = RUN ? describe : describe.skip;
const ACC = "zz_e2e_castlecasino";
const RES = ["wood", "stone", "gold", "diamonds"] as const;

function cleanup(): void {
  runSql(`
    DELETE FROM yuplink.castle_casino WHERE account_id = '${ACC}';
    DELETE FROM yuplink.res_ledger WHERE account_id = '${ACC}';
    DELETE FROM yuplink.account_resources WHERE account_id = '${ACC}';`);
}
const amount = (r: string) =>
  num(
    `SELECT coalesce((SELECT amount FROM yuplink.account_resources WHERE account_id='${ACC}' AND resource='${r}'),0);`,
  );
const seed = (r: string, n: number, tag: string) =>
  runSql(`SELECT * FROM yuplink.res_move('${ACC}','${r}',${n},'e2e_seed','${ACC}:${tag}:${r}');`);

beforeAll(() => {
  if (RUN) cleanup();
});
afterAll(() => {
  if (!RUN) return;
  cleanup();
  expect(
    num(`SELECT (SELECT count(*) FROM yuplink.castle_casino WHERE account_id='${ACC}')
      + (SELECT count(*) FROM yuplink.res_ledger WHERE account_id='${ACC}')
      + (SELECT count(*) FROM yuplink.account_resources WHERE account_id='${ACC}');`),
  ).toBe(0);
});

d("казино в замке: постройка за ресурсы", () => {
  it("алмазов не хватает — отказ, ничего не списано, казино нет", async () => {
    const { buildCastleCasinoFor, castleCasinoFor } = await import("@/server/api/slot/castle-casino");
    for (const r of RES) seed(r, r === "diamonds" ? CASINO_COST.diamonds - 1 : CASINO_COST[r], "a");
    await expect(buildCastleCasinoFor(ACC, "e2e-op-0001")).rejects.toThrow("Не хватает ресурсов");
    expect((await castleCasinoFor(ACC)).built).toBe(false);
    for (const r of RES) expect(amount(r)).toBe(r === "diamonds" ? CASINO_COST.diamonds - 1 : CASINO_COST[r]);
  });

  it("хватает — построено, списано ровно по цене", async () => {
    const { buildCastleCasinoFor, castleCasinoFor } = await import("@/server/api/slot/castle-casino");
    seed("diamonds", 1, "b");
    expect(await buildCastleCasinoFor(ACC, "e2e-op-0002")).toEqual({ built: true, applied: true });
    expect((await castleCasinoFor(ACC)).built).toBe(true);
    for (const r of RES) expect(amount(r)).toBe(0);
  });

  it("повторное нажатие — ничего не списывает", async () => {
    const { buildCastleCasinoFor } = await import("@/server/api/slot/castle-casino");
    for (const r of RES) seed(r, CASINO_COST[r], "c");
    expect(await buildCastleCasinoFor(ACC, "e2e-op-0003")).toEqual({ built: true, applied: false });
    for (const r of RES) expect(amount(r)).toBe(CASINO_COST[r]);
  });
});
