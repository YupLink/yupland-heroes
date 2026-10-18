// Б/у инструмент переносится на склад и обратно вместе с износом — проверка на
// тестовых данных в боевой базе (владелец, 14.10.2026: «дать возможность
// переносить всё»). Настоящие putToShelf / takeFromShelf и их SQL; подменён
// только поиск героя (тестовый герой zz_e2e_hero без строки героя).
// Запуск: E2E_PROD=1 npx vitest run --config vitest.e2e.config.ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", async () => ({
  mcpExec: (await import("./prodDb")).mcpExecViaPsql,
}));
vi.mock("@/server/db/pg", async () => ({ sb: (await import("./prodDb")).sbViaPsql }));
vi.mock("@/server/api/beta-raid/market-backpack", async (orig) => ({
  ...(await orig<typeof import("@/server/api/beta-raid/market-backpack")>()),
  resolveBackpack: async () => ({ heroId: HERO, capacity: 20, potionCapacity: 0 }),
}));
vi.mock("@/server/api/beta-raid/econ/trade-hooks", () => ({ noteShelf: async () => {} }));

import { num, runSql } from "./prodDb";

const RUN = process.env.E2E_PROD === "1";
const d = RUN ? describe : describe.skip;
const HERO = "zz_e2e_hero";
const ACC = "zz_e2e_wh";
const MAP = "zz_e2e_map";
const KEY = "custom:zz_e2e_pick";
const AT = { mapId: MAP, q: 0, r: 0, ownCells: 2, sharedCells: 8 };

function cleanup(): void {
  runSql(`
    DELETE FROM yuplink.raid_hero_backpack WHERE hero_id = '${HERO}';
    DELETE FROM yuplink.raid_warehouse_slot WHERE map_id = '${MAP}';
    DELETE FROM yuplink.raid_backpack_op WHERE op LIKE '%${MAP}%';`);
}
const leftovers = () =>
  num(`SELECT
    (SELECT count(*) FROM yuplink.raid_hero_backpack WHERE hero_id = '${HERO}') +
    (SELECT count(*) FROM yuplink.raid_warehouse_slot WHERE map_id = '${MAP}') +
    (SELECT count(*) FROM yuplink.raid_backpack_op WHERE op LIKE '%${MAP}%');`);
const bag = () =>
  runSql(
    `SELECT count::float || '/' || wear::float FROM yuplink.raid_hero_backpack WHERE hero_id='${HERO}' AND stack_key='${KEY}' AND count > 0;`,
  )[0] ?? "нет";
const shelf = () =>
  runSql(
    `SELECT count::float || '/' || wear::float FROM yuplink.raid_warehouse_slot WHERE map_id='${MAP}' AND stack_key='${KEY}' AND count > 0;`,
  )[0] ?? "нет";
const seed = (count: number, wear: number) =>
  runSql(`INSERT INTO yuplink.raid_hero_backpack
      (id, hero_id, account_id, kind, ref_id, item_id, stack_key, name, image, count, wear)
    VALUES ('bp_zz_e2e_pick', '${HERO}', '${ACC}', 'custom', 'zz_e2e_pick', NULL, '${KEY}',
            'Кирка (проверка)', NULL, ${count}, ${wear});`);

async function put(asked: number) {
  const { putToShelf } = await import("@/server/api/beta-raid/warehouse-put");
  return putToShelf({ wallet: ACC, account: ACC, at: AT, stackKey: KEY, asked, scope: "own" });
}
async function take(qty: number) {
  const { takeFromShelf } = await import("@/server/api/beta-raid/warehouse-take");
  return takeFromShelf({
    wallet: ACC,
    account: ACC,
    mapId: MAP,
    q: 0,
    r: 0,
    scope: "own",
    stackKey: KEY,
    qty,
  });
}

beforeAll(() => {
  if (RUN) cleanup();
});
afterAll(() => {
  if (!RUN) return;
  cleanup();
  expect(leftovers()).toBe(0);
});

d("склад: б/у кирка переносится вместе с износом", () => {
  it("3 кирки, текущая с износом 25 % — «всё» на склад: рюкзак пуст, полка 3 / 25 %", async () => {
    seed(3, 25);
    expect(await put(3)).toMatchObject({ own: 3, rejected: 0 });
    expect(bag()).toBe("нет");
    expect(shelf()).toBe("3/25");
  });

  it("забрал 2 — пришли целые, износ остался на полке", async () => {
    expect(await take(2)).toMatchObject({ qty: 2 });
    expect(bag()).toBe("2/0");
    expect(shelf()).toBe("1/25");
  });

  it("забрал последнюю — износ приехал в рюкзак, починки нет", async () => {
    expect(await take(1)).toMatchObject({ qty: 1 });
    expect(bag()).toBe("3/25");
    expect(shelf()).toBe("нет");
  });

  it("часть на склад (2 из 3) — уходят целые, износ в рюкзаке", async () => {
    expect(await put(2)).toMatchObject({ own: 2 });
    expect(bag()).toBe("1/25");
    expect(shelf()).toBe("2/0");
  });

  it("износ к износу: на полке 1 шт. с 60 %, кладу 1 шт. с 60 % → 1 шт. с 20 %", async () => {
    cleanup();
    runSql(`INSERT INTO yuplink.raid_warehouse_slot
        (id, map_id, q, r, scope, owner_account, stack_key, kind, ref_id, item_id, name, image, count, wear)
      VALUES ('whs_zz_e2e_1', '${MAP}', 0, 0, 'own', '${ACC}', '${KEY}', 'custom', 'zz_e2e_pick', NULL,
              'Кирка (проверка)', NULL, 1, 60);`);
    seed(1, 60);
    await put(1);
    expect(bag()).toBe("нет");
    expect(shelf()).toBe("1/20");
  });

  it("продажа/оплата по-прежнему не берёт изношенную штуку", async () => {
    cleanup();
    seed(1, 40);
    const { takeFromBackpackStack } = await import("@/server/api/beta-raid/market-backpack-take");
    await expect(takeFromBackpackStack(HERO, KEY, 1, { exact: true })).rejects.toThrow(
      "braid.tool_worn_stays",
    );
    expect(bag()).toBe("1/40");
  });
});
