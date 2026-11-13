// Рынок героев: договор кода с migrations/hero-market-03-pockets-to-main.sql —
// карманы основному. Сторож от тихой правки: все проверки -01/-02 на месте,
// отказы dmine/worn_tool убраны, сверка основного и отпечатка — до записей, замки
// в порядке, формулы меток и износа — ровно те, что выдают генераторы кода
// (stack-origin, tool-wear-move), вызов из кода — в порядке аргументов.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ORIGINS,
  originCols,
  originGrowSql,
  originSetSql,
  originTakeSql,
  originTakenSql,
} from "@/server/api/beta-raid/stack-origin";
import { addWearSql } from "@/server/api/beta-raid/tool-wear-move";
import { POTION_JOIN } from "@/server/api/beta-raid/potion-bag";
import { listCallSql } from "./hm-call";

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../migrations/${name}`, import.meta.url)), "utf8");
const SQL = read("hero-market-03-pockets-to-main.sql");
const flat = (s: string): string => s.replace(/\s+/g, " ").trim();
const list = SQL.slice(
  SQL.indexOf("FUNCTION yuplink.hero_market_list("),
  SQL.indexOf("END $fn$", SQL.indexOf("FUNCTION yuplink.hero_market_list(")),
);
const body = flat(list);
const at = (s: string): number => {
  const i = body.indexOf(flat(s));
  expect(i, s).toBeGreaterThan(-1);
  return i;
};

describe("миграция -03: форма", () => {
  it("одна транзакция, замок не дольше 5 с, повтор безвреден", () => {
    expect(SQL).toMatch(/^BEGIN;$/m);
    expect(SQL).toMatch(/^COMMIT;$/m);
    expect(SQL).toContain("SET LOCAL lock_timeout = '5s'");
    expect(SQL).not.toMatch(/CREATE FUNCTION/);
    expect(SQL).not.toMatch(/ADD COLUMN (?!IF NOT EXISTS)/);
    expect(SQL).toContain("ADD COLUMN IF NOT EXISTS main_hero text");
    expect(SQL).toContain("ADD COLUMN IF NOT EXISTS moves jsonb NOT NULL DEFAULT '[]'::jsonb");
  });

  it("-01 предупреждает: после неё обязательна -03, её восьмиаргументная — прежняя", () => {
    const first = read("hero-market-01.sql");
    expect(first).toContain("ПОСЛЕ ЭТОЙ МИГРАЦИИ ОБЯЗАТЕЛЬНЫ hero-market-02 и hero-market-03");
  });

  it("отпечаток: оба рюкзака, count > 0, износ и зелье (тот же POTION_JOIN)", () => {
    const fp = flat(SQL.slice(SQL.indexOf("hero_market_pockets_fp(p_hero"), SQL.indexOf("$f$;")));
    expect(fp).toContain(flat(POTION_JOIN));
    expect(fp).toContain("b.hero_id IN (p_hero, p_main) AND b.count > 0");
    expect(fp).toContain("b.wear::text");
    expect(fp).toContain("COALESCE(ci.is_potion, false)::text");
  });
});

describe("выставление: прежние проверки на месте", () => {
  it("минимумы, обычный, основной, отдых, грядка, рыбалка, уже выставлен, повтор по ключу", () => {
    for (const e of [
      "'price_required'",
      "'already_listed'",
      "'not_yours'",
      "'common'",
      "'active'",
      "'resting'",
      "'field'",
      "'fishing'",
      "'gold_min'",
      "'darai_rate'",
      "'darai_min'",
    ])
      expect(list).toContain(e);
    expect(list).toContain("SELECT * INTO v_lot FROM yuplink.hero_market_lot WHERE op = p_op");
    expect(list).toContain("v_min_darai := ceil(v_min * v_rate)");
  });

  it("залог: копия, герой и артефакты — на '_hero_market' по account_id; инструмент сброшен", () => {
    expect(list).toContain("c_escrow constant text := '_hero_market'");
    expect(body).toContain(
      "UPDATE yuplink.user_game_item SET account_id = c_escrow WHERE id = p_item",
    );
    expect(body).toContain("SET account_id = c_escrow, equipped = v_eq, main_tool = NULL");
    expect(body).toContain("o.account_id = p_account AND o.id <> h.id");
  });

  it("отказов dmine и worn_tool больше нет", () => {
    expect(list).not.toContain("'dmine')");
    expect(list).not.toContain("'worn_tool'");
  });
});

describe("карманы → основному", () => {
  it("замки: копия → герой → рюкзаки двух героев по возрастанию id → клетка → мешочек", () => {
    const order = [
      "hashtext('heroitem:' || p_item)",
      "hashtext('hero:' || h.id)",
      "hashtext('bp:' || LEAST(h.id, p_main))",
      "hashtext('bp:' || GREATEST(h.id, p_main))",
      "hashtext('lootdrop:' || v_map",
      "hashtext('lootbag:' || v_bag)",
    ].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("основной тот же и отпечаток совпал — иначе «поменялось», всё до первой записи", () => {
    const write = at("INSERT INTO yuplink.raid_loot_bag");
    const lock = at("WHERE b.hero_id IN (h.id, p_main) ORDER BY b.hero_id, b.stack_key FOR UPDATE");
    const fp = at("yuplink.hero_market_pockets_fp(h.id, p_main) IS DISTINCT FROM p_seen");
    expect(at("IF v_now_main IS DISTINCT FROM p_main THEN")).toBeLessThan(lock);
    expect(lock).toBeLessThan(fp);
    for (const e of ["'pockets_changed'", "'no_position'", "'pockets_overflow'"])
      expect(at(e)).toBeLessThan(write);
    expect(at("IF NOT COALESCE(p_accept, false) THEN")).toBeLessThan(write);
    // Нет позиции — раньше согласия; гриб без основного — до первой записи.
    expect(at("'no_position'")).toBeLessThan(at("IF NOT COALESCE(p_accept, false) THEN"));
    expect(at("IF v_dm AND p_main IS NULL THEN")).toBeGreaterThan(fp);
    expect(at("'dmine_no_main'")).toBeLessThan(write);
  });

  it("основного нет — всё мешочком на клетку игрока, как до правки; гриб — отказ", () => {
    // Отказа «нет основного» как такового нет: no_position — только без позиции.
    expect(body).not.toContain(
      "IF p_main IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'no_position')",
    );
    expect(body).toContain("OR (p_main IS NULL AND (v_main > 0 OR v_plant > 0))");
    expect(body).toContain(
      "IF p_main IS NOT NULL THEN UPDATE yuplink.raid_dmine SET hero_id = p_main",
    );
  });

  it("мешочку — остаток стопки (ROUND 9), план сверяется со стопками", () => {
    expect(body).toContain("v_put := ROUND(x.count - v_main - v_burn - v_plant, 9)");
    expect(body).toContain("RAISE EXCEPTION 'heromkt: план карманов не сходится: %'");
    expect(body).toContain("(v_dm AND (v_put > 0 OR v_burn > 0))");
    // Начатая штука без места сгорает ровно она — в мешочек износ не едет.
    expect(body).toContain("v_main = 0 AND v_burn <> LEAST(x.count, 1)");
  });

  it("метки происхождения — формулами stack-origin (как у «Выбросить» и выдачи)", () => {
    const take = originTakeSql(originCols("x."), "v_to");
    for (const k of ORIGINS) expect(body).toContain(flat(`${take[k]} AS ${k}_count`));
    const taken = originTakenSql(originCols("x."), originCols("t."));
    for (const k of ORIGINS) expect(body).toContain(flat(taken[k]));
    const whole = originTakeSql(originCols("x."), "v_put");
    for (const k of ORIGINS) expect(body).toContain(flat(whole[k]));
    expect(body).toContain(flat(originSetSql(originTakeSql(originCols(), "v_to"))));
    expect(body).toContain(flat(originSetSql(originGrowSql(originCols("m."), take))));
  });

  it("износ основному — правилом tool-wear-move (до 100 — одна штука доломана)", () => {
    const wear = addWearSql(
      "raid_hero_backpack",
      "hero_id = p_main AND stack_key = x.stack_key",
      12.345,
    );
    expect(body).toContain(flat(wear.replaceAll("12.345", "v_wear")));
    expect(body).toContain("v_wear := LEAST(99.9999, x.wear)");
  });

  it("грибы: строки — основному, не влезшие — час в рюкзаке сдвинут на сейчас", () => {
    expect(body).toContain(
      "UPDATE yuplink.raid_dmine SET hero_id = p_main WHERE state = 'item' AND hero_id = h.id",
    );
    expect(body).toContain("SET taken_at = LEAST(taken_at, now() - v_carry)");
    expect(body).toContain("LIMIT ceil(v_plant)::int");
  });

  it("лот помнит основного и раскладку; повтор нажатия отвечает ими", () => {
    expect(body).toContain("'moves', v_lot.moves, 'mainHero', v_lot.main_hero");
    expect(body).toContain("pockets, main_hero, moves)");
  });
});

describe("вызов из кода", () => {
  it("аргументы — в порядке объявления, план и отпечаток — строками", () => {
    expect(SQL).toContain(
      "p_op text, p_account text, p_wallet text, p_item text,\n  p_price_gold numeric, p_price_darai numeric, p_mins jsonb, p_bag_hours integer,\n  p_main text, p_plan jsonb, p_seen text, p_accept boolean",
    );
    const call = listCallSql({
      op: "o",
      account: "a",
      wallet: "w",
      itemId: "i",
      priceGold: 1000,
      priceDarai: null,
      mainId: "hi_m",
      plan: { carry: 3600, lines: { "custom:x": { main: 1, bag: 0, burn: 0, plant: 0 } } },
      seen: "fp'1",
      accept: true,
    });
    expect(call).toMatch(
      /hero_market_list\('o', 'a', 'w',\s+'i', 1000, NULL, '\{"rare":1000,"epic":2500,"legendary":5000\}'::jsonb,\s+24, 'hi_m',\s+'\{"carry":3600,"lines":\{"custom:x":\{"main":1,"bag":0,"burn":0,"plant":0\}\}\}'::jsonb, 'fp''1', true\)/,
    );
    expect(
      listCallSql({
        ...{ op: "o", account: "a", wallet: "w", itemId: "i" },
        priceGold: 1,
        priceDarai: null,
        mainId: null,
        plan: {},
        seen: "",
        accept: false,
      }),
    ).toContain("24, NULL,");
  });
});
