// Проверки казино и ломбарда на ТЕСТОВЫХ данных в боевой базе: настоящий
// серверный код (slot-core, market-pawn, маркетные spend/deliverGood), база —
// через psql по SSH. Тестовые аккаунты zz_e2e_*, тестовая карта zz_e2e_map;
// до и после — полная уборка, в конце проверка, что следов нет.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", async () => ({
  mcpExec: (await import("./prodDb")).mcpExecViaPsql,
}));
vi.mock("@/server/db/pg", async () => ({ sb: (await import("./prodDb")).sbViaPsql }));

import { num, one, runSql } from "./prodDb";
import { slotActFor, slotLoadFor, type SlotView } from "@/server/api/slot/slot-core";
import { HIDDEN } from "@/lib/slot/publicView";
import { reachedShore } from "@/lib/slot/bonus";
import type { ClientAction } from "@/lib/slot/serverStep";

const RUN = process.env.E2E_PROD === "1";
const d = RUN ? describe : describe.skip;

const CASINO = "zz_e2e_casino";
const SELLER = "zz_e2e_seller";
const BUYER = "zz_e2e_buyer";
const MAP = "zz_e2e_map";
const ACCS = `'${CASINO}','${SELLER}','${BUYER}'`;
const SEED = 5000;

function cleanup(): void {
  runSql(`
    DELETE FROM yuplink.slot_session WHERE account_id IN (${ACCS});
    DELETE FROM yuplink.res_ledger WHERE account_id IN (${ACCS});
    DELETE FROM yuplink.account_resources WHERE account_id IN (${ACCS});
    DELETE FROM yuplink.user_game_item WHERE account_id IN (${ACCS}) OR wallet IN (${ACCS});
    DELETE FROM yuplink.raid_market_item WHERE map_id = '${MAP}';
    DELETE FROM yuplink.raid_market_shop WHERE map_id = '${MAP}';
    DELETE FROM yuplink.raid_backpack_op WHERE op LIKE '%zz_e2e%';`);
}
function leftovers(): number {
  return num(`SELECT
    (SELECT count(*) FROM yuplink.slot_session WHERE account_id IN (${ACCS})) +
    (SELECT count(*) FROM yuplink.res_ledger WHERE account_id IN (${ACCS})) +
    (SELECT count(*) FROM yuplink.account_resources WHERE account_id IN (${ACCS})) +
    (SELECT count(*) FROM yuplink.user_game_item WHERE account_id IN (${ACCS}) OR wallet IN (${ACCS})) +
    (SELECT count(*) FROM yuplink.raid_market_item WHERE map_id = '${MAP}') +
    (SELECT count(*) FROM yuplink.raid_market_shop WHERE map_id = '${MAP}') +
    (SELECT count(*) FROM yuplink.raid_backpack_op WHERE op LIKE '%zz_e2e%');`);
}
const gold = (acc: string) =>
  num(
    `SELECT coalesce((SELECT amount FROM yuplink.account_resources WHERE account_id='${acc}' AND resource='gold'),0);`,
  );
const ledgerRows = (acc: string) =>
  num(`SELECT count(*) FROM yuplink.res_ledger WHERE account_id='${acc}';`);
const seedGold = (acc: string, amount: number, tag: string) =>
  runSql(`SELECT * FROM yuplink.res_move('${acc}','gold',${amount},'e2e_seed','${acc}:${tag}');`);

beforeAll(() => {
  if (!RUN) return;
  cleanup();
});
afterAll(() => {
  if (!RUN) return;
  cleanup();
  expect(leftovers()).toBe(0);
});

/** Что видит браузер: скрытое скрыто. */
function assertHidden(v: SlotView): void {
  const b = v.state.bonus;
  if (b)
    b.board.forEach((row, r) =>
      row.forEach((val, c) => b.picks[r] !== c && expect(val).toBe(HIDDEN)),
    );
  const g = v.state.superGame;
  if (g) g.friend.forEach((f, i) => i > g.step && expect(f).toBe(HIDDEN));
  const k = v.state.risk;
  // Карты удвоения скрыты только до выбора: после него открыты все (раунд разыгран).
  if (k && k.picked === null) k.hand.forEach((card) => expect(card.rank).toBe(0));
}

d("казино на золото — настоящий серверный код, тестовый аккаунт", () => {
  let v: SlotView;
  let adjust = 0;
  const counts = {
    spins: 0,
    risk: 0,
    riskWin: 0,
    riskLose: 0,
    bonus: 0,
    super: 0,
    superHit: 0,
    trap: 0,
  };

  /** Ход + проверки денег и учёта. */
  async function act(action: ClientAction): Promise<SlotView> {
    const prev = v;
    const res = await slotActFor(CASINO, action, prev.version);
    const delta = Math.round((res.gold - prev.gold) * 10000) / 10000;
    expect(res.gold).toBe(gold(CASINO));
    expect(res.gold).toBe(SEED + adjust - res.state.stats.wagered + res.state.stats.won);
    if (action.type === "spin")
      expect(delta).toBe((res.state.result?.totalWin ?? 0) - action.lines * action.bet);
    else if (action.type === "risk-start") expect(delta).toBe(-prev.state.lastWin);
    else if (action.type === "risk-take") expect(delta).toBe(prev.state.pending);
    else if (action.type === "bonus-finish") expect(delta).toBe(prev.state.bonusTotal);
    else expect(delta).toBe(0);
    assertHidden(res);
    v = res;
    return res;
  }

  /** Довести текущую фазу до барабанов, решая как игрок. */
  async function settle(rand: () => number): Promise<void> {
    for (let guard = 0; guard < 200; guard++) {
      const s = v.state;
      if (s.phase === "idle" || s.phase === "won") return;
      if (s.phase === "risk" && s.risk) {
        if (s.risk.picked === null) await act({ type: "risk-pick", index: Math.floor(rand() * 4) });
        else if (s.risk.outcome === "lose") {
          counts.riskLose++;
          await act({ type: "risk-close" });
        } else if (s.risk.done || rand() < 0.5) {
          if (s.risk.outcome === "win") counts.riskWin++;
          await act({ type: "risk-take" });
        } else {
          if (s.risk.outcome === "win") counts.riskWin++;
          await act({ type: "risk-next" });
        }
      } else if (s.phase === "bonus-won") await act({ type: "bonus-enter" });
      else if (s.phase === "bonus" && s.bonus) {
        if (s.bonus.fell) {
          counts.trap++;
          await act({ type: "bonus-close" });
        } else if (reachedShore(s.bonus)) {
          counts.super++;
          await act({ type: "super-enter" });
        } else await act({ type: "bonus-pick", col: Math.floor(rand() * 5) });
      } else if (s.phase === "super" && s.superGame) {
        if (s.superGame.done) await act({ type: "bonus-close" });
        else if (s.superGame.lastPick === "hit") {
          counts.superHit++;
          await act({ type: "super-next" });
        } else await act({ type: "super-pick", side: rand() < 0.5 ? 0 : 1 });
      } else if (s.phase === "bonus-end") await act({ type: "bonus-finish" });
      else throw new Error(`фаза ${s.phase} без хода`);
    }
    throw new Error("игра не вернулась к барабанам");
  }

  it("засев: 5000 золота, автомат пустой", async () => {
    seedGold(CASINO, SEED, "seed");
    v = await slotLoadFor(CASINO).then((x) => ({
      state: x.state,
      gold: x.gold,
      version: x.version,
    }));
    expect(v.version).toBe(0);
    expect(v.gold).toBe(SEED);
  });

  it("40 спинов разными ставками и линиями, удвоение по ходу — деньги сходятся на каждом ходу", async () => {
    let a = 7;
    const rand = () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648;
    const LINES = [1, 3, 5, 7, 9];
    const BETS = [1, 2, 5];
    for (let i = 0; i < 40; i++) {
      await act({ type: "spin", lines: LINES[i % 5], bet: BETS[i % 3] });
      counts.spins++;
      if (v.state.phase === "won" && rand() < 0.6) {
        counts.risk++;
        await act({ type: "risk-start" });
      }
      await settle(rand);
    }
    expect(counts.risk).toBeGreaterThan(0);
    expect(v.state.stats.spins).toBe(40);
  });

  it("бонус и супер-бонус: подсаживаем «бонус выигран», играем как игрок до супера", async () => {
    let a = 99;
    const rand = () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < 30 && counts.superHit + (counts.super ? 1 : 0) < 2; t++) {
      // Тестовые данные: автомат в состоянии «3 Бонуса выпало», ставка за спин 9.
      runSql(`UPDATE yuplink.slot_session SET state = state || '{"phase":"bonus-won","bonusStake":9,"bonus":null,"superGame":null}'::jsonb
               WHERE account_id='${CASINO}';`);
      v = await slotLoadFor(CASINO);
      counts.bonus++;
      await settle(rand);
    }
    expect(counts.bonus).toBeGreaterThan(0);
    expect(counts.super).toBeGreaterThan(0);
  });

  it("устаревший ход и двойной тап: деньги двигаются один раз", async () => {
    const rows = ledgerRows(CASINO);
    const stale = await slotActFor(CASINO, { type: "spin", lines: 9, bet: 1 }, v.version - 1);
    expect(stale.version).toBe(v.version);
    expect(ledgerRows(CASINO)).toBe(rows);
    const [x, y] = await Promise.all([
      slotActFor(CASINO, { type: "spin", lines: 9, bet: 1 }, v.version),
      slotActFor(CASINO, { type: "spin", lines: 9, bet: 1 }, v.version),
    ]);
    // Ход прошёл ровно один (версия +1). Строка журнала — одна или ноль: спин,
    // где выигрыш ровно равен ставке, золото не двигает (17.10: таких стало больше).
    expect(Math.max(x.version, y.version)).toBe(v.version + 1);
    expect(ledgerRows(CASINO)).toBeLessThanOrEqual(rows + 1);
    expect((await slotLoadFor(CASINO)).version).toBe(v.version + 1);
    v = await slotLoadFor(CASINO);
    await settle(() => 0.9);
  });

  it("отказы: нет такой ставки, мало золота, база не даёт уйти в минус", async () => {
    await expect(slotActFor(CASINO, { type: "spin", lines: 2, bet: 1 }, v.version)).rejects.toThrow(
      "slot.bad_bet",
    );
    await expect(slotActFor(CASINO, { type: "spin", lines: 9, bet: 7 }, v.version)).rejects.toThrow(
      "slot.bad_bet",
    );
    const g = gold(CASINO);
    runSql(
      `SELECT * FROM yuplink.res_move('${CASINO}','gold',${5 - g},'e2e_adjust','${CASINO}:adjust');`,
    );
    adjust += 5 - g;
    v = await slotLoadFor(CASINO);
    const rows = ledgerRows(CASINO);
    await expect(slotActFor(CASINO, { type: "spin", lines: 9, bet: 1 }, v.version)).rejects.toThrow(
      "slot.not_enough",
    );
    expect(() =>
      runSql(
        `SELECT * FROM yuplink.slot_commit('${CASINO}', ${v.version}, '{}'::jsonb, -1000, 'slot_spin', 'zz_e2e:minus');`,
      ),
    ).toThrow(/в минус/);
    expect(ledgerRows(CASINO)).toBe(rows);
    expect(gold(CASINO)).toBe(5);
  });

  it("итог прогона", () => {
    console.log(
      "[e2e казино]",
      JSON.stringify({ ...counts, gold: gold(CASINO), stats: v.state.stats }),
    );
  });
});

d("ломбард: сдал «любой артефакт» → золото → на витрине с наценкой → купили", () => {
  let tplA = "";
  let tplB = "";

  it("тестовая лавка и артефакты", () => {
    const tpls = runSql(
      `SELECT id FROM yuplink.mystic_item_template WHERE kind='artifact' AND active AND rarity='rare' ORDER BY id LIMIT 2;`,
    );
    [tplA, tplB] = tpls;
    expect(tplA && tplB).toBeTruthy();
    runSql(`
      INSERT INTO yuplink.raid_market_item (id, map_id, q, r, pos, kind, ref_id, give_amount, name, price_resource, price_amount, side)
      VALUES ('zz_e2e_sell_rare', '${MAP}', 0, 0, 0, 'art', 'art_any_rare', 1, 'Любой редкий артефакт', 'gold', 10, 'sell'),
             ('zz_e2e_sell_iron', '${MAP}', 0, 0, 1, 'resource', 'stone', 1, 'Камень', 'gold', 2, 'sell');
      INSERT INTO yuplink.user_game_item (id, wallet, account_id, template_id, kind, source, obtained_at) VALUES
        ('zz_e2e_art_1', '${SELLER}', '${SELLER}', '${tplA}', 'artifact', 'e2e', now() - interval '3 min'),
        ('zz_e2e_art_2', '${SELLER}', '${SELLER}', '${tplA}', 'artifact', 'e2e', now() - interval '2 min'),
        ('zz_e2e_art_3', '${SELLER}', '${SELLER}', '${tplB}', 'artifact', 'e2e', now() - interval '1 min');`);
  });

  /** Та же цепочка, что в market-sell: списать арт → выплатить золото → перепродажа. */
  async function sell(pickTemplate: string, n: number): Promise<void> {
    const { marketItemById } = await import("@/server/api/beta-raid/market-admin");
    const { spend } = await import("@/server/api/beta-raid/market-money");
    const { deliverGood } = await import("@/server/api/beta-raid/market-deliver");
    const { payoutAsGood } = await import("@/server/api/beta-raid/market-sell-good");
    const { relistPawned } = await import("@/server/api/beta-raid/market-pawn");
    const item = (await marketItemById("zz_e2e_sell_rare", MAP))!;
    const ref = `mkt-sell:zz_e2e:${n}`;
    const receipt = await spend(SELLER, SELLER, "art", "art_any_rare", 1, ref, {
      artTemplateId: pickTemplate,
    });
    await deliverGood({
      wallet: SELLER,
      account: SELLER,
      item: payoutAsGood(item, "gold", null, null),
      qty: 10,
      payRef: `${ref}:pay0`,
      nonce: `zz_e2e_${n}`,
    });
    await relistPawned({
      mapId: MAP,
      item,
      templateIds: (receipt.paidArts ?? []).map((a) => a.templateId),
    });
  }
  const pawnRows = () =>
    runSql(`SELECT row_to_json(t) FROM (SELECT ref_id, price_amount::float AS price, stock::float AS stock, sold::float AS sold, side, kind
             FROM yuplink.raid_market_item WHERE map_id='${MAP}' AND id LIKE 'pawn\\_%' ORDER BY price_amount DESC, ref_id) t;`).map(
      (l) =>
        JSON.parse(l) as {
          ref_id: string;
          price: number;
          stock: number;
          sold: number;
          side: string;
          kind: string;
        },
    );
  const arts = (acc: string, tpl?: string) =>
    num(
      `SELECT count(*) FROM yuplink.user_game_item WHERE account_id='${acc}' AND kind='artifact' ${tpl ? `AND template_id='${tpl}'` : ""};`,
    );

  it("наценка по умолчанию ×5", async () => {
    const { pawnMarkupFor } = await import("@/server/api/beta-raid/market-pawn");
    expect(await pawnMarkupFor(MAP, 0, 0)).toBe(5);
  });

  it("сдал артефакт A за 10 золота → в лавке он же за 50", async () => {
    await sell(tplA, 1);
    expect(arts(SELLER)).toBe(2);
    expect(gold(SELLER)).toBe(10);
    expect(pawnRows()).toEqual([
      { ref_id: tplA, price: 50, stock: 1, sold: 0, side: "buy", kind: "art" },
    ]);
  });

  it("сдал ещё один A — та же позиция, запас 2", async () => {
    await sell(tplA, 2);
    expect(gold(SELLER)).toBe(20);
    expect(pawnRows()).toEqual([
      { ref_id: tplA, price: 50, stock: 2, sold: 0, side: "buy", kind: "art" },
    ]);
  });

  it("админ поставил ×3 → артефакт B выставлен за 30", async () => {
    const { savePawnMarkup, pawnMarkupFor } = await import("@/server/api/beta-raid/market-pawn");
    await savePawnMarkup(MAP, 0, 0, 3);
    expect(await pawnMarkupFor(MAP, 0, 0)).toBe(3);
    await sell(tplB, 3);
    expect(pawnRows()).toEqual([
      { ref_id: tplA, price: 50, stock: 2, sold: 0, side: "buy", kind: "art" },
      { ref_id: tplB, price: 30, stock: 1, sold: 0, side: "buy", kind: "art" },
    ]);
    expect(arts(SELLER)).toBe(0);
  });

  it("сдавать больше нечего — отказ, ничего не двигается", async () => {
    await expect(sell(tplA, 4)).rejects.toThrow(/art_rarity_none/);
    expect(gold(SELLER)).toBe(30);
  });

  it("покупатель купил A за 50: золото списано, артефакт у него, запас уменьшился", async () => {
    const { marketItemById } = await import("@/server/api/beta-raid/market-admin");
    const { spend } = await import("@/server/api/beta-raid/market-money");
    const { deliverGood } = await import("@/server/api/beta-raid/market-deliver");
    const { reserveStock } = await import("@/server/api/beta-raid/market-stock");
    seedGold(BUYER, 100, "seed");
    const id = one(
      `SELECT id FROM yuplink.raid_market_item WHERE map_id='${MAP}' AND ref_id='${tplA}' AND id LIKE 'pawn\\_%';`,
    );
    const item = (await marketItemById(id, MAP))!;
    expect(item.side).toBe("buy");
    expect(await reserveStock(id, MAP, 1)).toBe(true);
    await spend(
      BUYER,
      BUYER,
      item.priceResource,
      item.priceToken,
      item.priceAmount,
      "mkt-buy:zz_e2e:1",
    );
    await deliverGood({
      wallet: BUYER,
      account: BUYER,
      item,
      qty: 1,
      payRef: "mkt-buy:zz_e2e:1",
      nonce: "zz_e2e_b1",
    });
    expect(gold(BUYER)).toBe(50);
    expect(arts(BUYER, tplA)).toBe(1);
    expect(pawnRows()[0]).toMatchObject({ ref_id: tplA, stock: 2, sold: 1 });
  });

  it("раскупили A до нуля — с витрины ломбарда пропал, B на месте", async () => {
    const { marketExtra } = await import("@/server/api/beta-raid/market-extra");
    const ids = async () => {
      const v = (await marketExtra({ mapId: MAP, q: 0, r: 0, hero: null })) as {
        items: Array<{ id: string; refId: string | null; side: string }>;
      };
      return v.items.filter((i) => i.side === "buy").map((i) => i.refId);
    };
    expect((await ids()).sort()).toEqual([tplA, tplB].sort());
    runSql(
      `UPDATE yuplink.raid_market_item SET sold = stock WHERE map_id='${MAP}' AND ref_id='${tplA}' AND id LIKE 'pawn\\_%';`,
    );
    expect(await ids()).toEqual([tplB]);
  });

  it("другая скупка (не «любой артефакт») на продажу ничего не выставляет", async () => {
    const { marketItemById } = await import("@/server/api/beta-raid/market-admin");
    const { relistPawned } = await import("@/server/api/beta-raid/market-pawn");
    const before = pawnRows().length;
    const item = (await marketItemById("zz_e2e_sell_iron", MAP))!;
    await relistPawned({ mapId: MAP, item, templateIds: [tplA] });
    expect(pawnRows().length).toBe(before);
  });
});

d("постройки «Казино» на карте (только чтение)", () => {
  it("все клетки с поведением «Казино» — окно отдаёт кнопку игры", async () => {
    const { loadCellBuilding } = await import("@/server/api/beta-raid/building-action");
    const { buildingExtra } = await import("@/server/api/beta-raid/building-extra");
    // Где стоят казино, решает админ (13.10 он сам поставил «Казарму» с обликом
    // «Казино»), поэтому клетки ищем по поведению, а не по координатам.
    const cells = runSql(
      `SELECT c.q || ',' || c.r FROM yuplink.raid_map_cells c
         JOIN yuplink.mystic_item_template t ON t.id = c.building_id
        WHERE c.map_id = 'rmap_UthOURxc'
          AND COALESCE(c.building_config->>'effect', t.meta->>'effect') = 'casino';`,
    ).map((l) => l.split(",").map(Number) as [number, number]);
    expect(cells.length).toBeGreaterThan(0);
    for (const [q, r] of cells) {
      const b = await loadCellBuilding("rmap_UthOURxc", q, r);
      expect(b?.effect).toBe("casino");
      const extra = await buildingExtra({
        effect: b!.effect,
        built: true,
        wallet: CASINO,
        mapId: "rmap_UthOURxc",
        q,
        r,
        hero: null,
        tier: b!.tier,
        meta: b!.meta,
        cellConfig: b!.config,
      });
      expect(extra).toEqual({ kind: "casino" });
    }
    // Старого декора «Казино» на карте больше нет.
    expect(
      num(
        `SELECT count(*) FROM yuplink.raid_map_cells WHERE decoration_id IN ('decoration_1rC-82whjx','decoration_KifsUJ5X5h');`,
      ),
    ).toBe(0);
  });
});
