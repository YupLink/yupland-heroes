// Миграции хижины шаманов — договор с обрядом погоды (weather-04) и кодом:
//  · shaman-01: одна хижина на аккаунт; castle_shaman (count ≥ 0);
//    castle_shaman_take(p_acc) → boolean — минус один, только если есть;
//    castle_shaman_buy — замок аккаунта, ключ повтора до списания, хижина,
//    один ресурс счёта через res_move.
//  · shaman-02: шаблон босса «Шаман» с HP 0 и без урона — только для погоды.
//  · Забор в рюкзак (shaman-stock): тот же замок, castle_shaman_take только без
//    прошлого ключа, ключ — только вместе со списанием.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { SHAMAN_HUT_KIND } from "@/lib/townHallCatalog";
import { SHAMAN_ART, SHAMAN_CURRENCIES, SHAMAN_TEMPLATE_ID } from "@/lib/shamanHut";
import { DEFAULT_SPLIT } from "@/server/api/raid-shared";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async () => [] }));
const { refundShamanSql, takeShamanSql } = await import("./shaman-stock");

const read = (name: string) =>
  readFileSync(fileURLToPath(new URL(`../../../../migrations/${name}`, import.meta.url)), "utf8");
const one = read("shaman-01-hut-stock.sql");
const two = read("shaman-02-boss-template.sql");
const flat = (s: string) => s.replace(/--.*$/gm, "").replace(/\s+/g, " ");

describe("миграция shaman-01", () => {
  it("одной транзакцией, чужой лок ждём не дольше 5 с; повтор безвреден", () => {
    expect(one).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(one.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(one).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(one).not.toMatch(/CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/);
    expect(one).not.toMatch(/CREATE FUNCTION/);
    expect(one).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/);
  });
  it("одна хижина на аккаунт — индекс по виду из кода", () => {
    expect(one).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS castle_building_one_shaman_hut\n" +
        `  ON yuplink.castle_building (account_id) WHERE kind = '${SHAMAN_HUT_KIND}';`,
    );
  });
  it("castle_shaman — ровно по договору с обрядом", () => {
    expect(flat(one)).toContain(
      "CREATE TABLE IF NOT EXISTS yuplink.castle_shaman ( account_id text PRIMARY KEY, " +
        "count int NOT NULL DEFAULT 0 CHECK (count >= 0), " +
        "updated_at timestamptz NOT NULL DEFAULT now() );",
    );
  });
  it("castle_shaman_take: минус один одним UPDATE, только при count > 0; иначе false", () => {
    expect(flat(one)).toContain(
      "CREATE OR REPLACE FUNCTION yuplink.castle_shaman_take(p_acc text) RETURNS boolean " +
        "LANGUAGE sql AS $fn$ WITH t AS ( UPDATE yuplink.castle_shaman " +
        "SET count = count - 1, updated_at = now() WHERE account_id = p_acc AND count > 0 " +
        "RETURNING 1 ) SELECT EXISTS (SELECT 1 FROM t); $fn$;",
    );
  });
  it("castle_shaman_buy: замок, повтор ключа не списывает, хижина, один ресурс счёта", () => {
    const fn = flat(one.slice(one.indexOf("FUNCTION yuplink.castle_shaman_buy")));
    const at = (s: string) => {
      const i = fn.indexOf(s);
      expect(i, s).toBeGreaterThan(-1);
      return i;
    };
    const lock = at("PERFORM pg_advisory_xact_lock(hashtext('shaman:' || p_account));");
    const again = at("FROM yuplink.castle_shaman_op o WHERE o.op_id = p_op) THEN");
    const hut = at(`b.account_id = p_account AND b.kind = '${SHAMAN_HUT_KIND}') THEN`);
    const pay = at(
      "PERFORM yuplink.res_move(p_account, v_res, -v_amt, 'castle_shaman', 'shaman:' || p_op);",
    );
    const add = at("ON CONFLICT (account_id) DO UPDATE SET count = s.count + 1");
    const log = at("INSERT INTO yuplink.castle_shaman_op (op_id, account_id, price)");
    expect([lock, again, hut, pay, add, log]).toEqual(
      [lock, again, hut, pay, add, log].sort((a, b) => a - b),
    );
    expect(fn).toContain("(SELECT count(*) FROM jsonb_object_keys(p_price)) <> 1");
    const list = SHAMAN_CURRENCIES.map((c) => `'${c}'`).join(", ");
    expect(fn).toContain(`v_res NOT IN (${list})`);
    expect(fn).toContain("RETURNS TABLE(shamans integer, applied boolean)");
  });
});

describe("миграция shaman-02", () => {
  it("шаблон «Шаман»: id и картинка из кода, HP 0, урона нет; настроенный не трогаем", () => {
    expect(two).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(two.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(flat(two)).toContain(
      "INSERT INTO yuplink.raid_boss_template (id, name, image_url, max_hp, reward_tiers) " +
        `VALUES ('${SHAMAN_TEMPLATE_ID}', 'Шаман', '${SHAMAN_ART}', 0, ` +
        `'{"fillers": [], "split": [${DEFAULT_SPLIT.join(", ")}], "packs": []}'::jsonb) ` +
        "ON CONFLICT (id) DO NOTHING;",
    );
    expect(two).not.toMatch(/\bdamage\b.*VALUES|\b(UPDATE|DELETE|DROP)\b/);
  });
});

describe("забор шамана в рюкзак (shaman-stock)", () => {
  const take = flat(takeShamanSql("acc_me", "shaman:n1:take"));
  const back = flat(refundShamanSql("acc_me", "bp:shaman:n1", "shaman:n1:back"));
  it("тот же замок аккаунта, что у покупки", () => {
    for (const q of [take, back])
      expect(q).toContain("SELECT pg_advisory_xact_lock(hashtext('shaman:acc_me')) AS l;");
  });
  it("castle_shaman_take — только без прошлого ключа; ключ — только вместе со списанием", () => {
    expect(take).toContain(
      "CASE WHEN (SELECT was FROM prior) THEN false ELSE yuplink.castle_shaman_take('acc_me') END AS ok",
    );
    expect(take).toContain("SELECT 'shaman:n1:take' FROM took WHERE took.ok");
    expect(take).toContain("((SELECT was FROM prior) OR (SELECT ok FROM took)) AS took");
  });
  it("возврат — только если ключ выдачи заперли мы; повтор возврата не задваивает", () => {
    expect(back).toContain("SELECT 'bp:shaman:n1' FROM prior WHERE NOT prior.was");
    expect(back).toContain("SELECT 'shaman:n1:back' FROM blk");
    expect(back).toContain("SELECT 'acc_me', 1 FROM blk");
  });
});
