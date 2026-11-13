// Миграция minev2-40 (товары в цене Архитектора, ПРАВИЛА §8.59 п. 7): оплата,
// улучшение и возврат — копии minev2-10 ровно с правками товаров (ничего больше
// не поменялось); товары берутся в той же функции, что ресурсы, после проверки
// повтора ключа; возврат отдаёт товары по снимку тому же герою; старые
// сигнатуры удаляются до новых (иначе вызов с 4 аргументами неоднозначен).
// Сам SQL прогнан на копии прода в BEGIN … ROLLBACK (отчёт задачи).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../migrations/${name}`, import.meta.url)), "utf8");

const m10 = read("minev2-10-architect.sql");
const m40 = read("minev2-40-architect-goods.sql");

/** Текст функции: от заголовка до конца тела. */
function fn(src: string, name: string): string {
  const head = `CREATE OR REPLACE FUNCTION yuplink.${name}(`;
  const i = src.indexOf(head);
  if (i < 0) throw new Error(`нет функции: ${name}`);
  const j = src.indexOf("END $fn$;", i);
  return src.slice(i, j + "END $fn$;".length);
}

/** Одна замена; кусок обязан встречаться ровно раз. */
function patch(text: string, from: string, to: string): string {
  expect(text.split(from).length - 1, from).toBe(1);
  return text.replace(from, to);
}

const DETAIL_GOODS = `
            || CASE WHEN jsonb_array_length(v_goods) > 0
                    THEN jsonb_build_object('hero', p_hero, 'goods', v_goods) ELSE '{}'::jsonb END);`;
const TAKE = "  v_goods := yuplink.castle_architect_take_goods(p_hero, p_cost->'goods');\n";

describe("minev2-40: товары в цене Архитектора", () => {
  it("оплата заготовки — прежняя функция плюс товары под тем же ключом", () => {
    let want = fn(m10, "castle_architect_pay");
    want = patch(want, "p_op text\n) RETURNS", "p_op text, p_hero text DEFAULT NULL\n) RETURNS");
    want = patch(want, "v_refunded timestamptz;", "v_refunded timestamptz; v_goods jsonb;");
    want = patch(
      want,
      `  INSERT INTO yuplink.castle_architect_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'blueprint', jsonb_build_object('blueprint', p_kind, 'cost', p_cost));`,
      `${TAKE}  INSERT INTO yuplink.castle_architect_op(op_id, account_id, kind, detail)
    VALUES (p_op, p_account, 'blueprint',
            jsonb_build_object('blueprint', p_kind, 'cost', p_cost)${DETAIL_GOODS}`,
    );
    expect(fn(m40, "castle_architect_pay")).toBe(want);
  });

  it("улучшение — прежняя функция плюс товары", () => {
    let want = fn(m10, "castle_architect_upgrade");
    want = patch(want, "p_op text\n) RETURNS", "p_op text, p_hero text DEFAULT NULL\n) RETURNS");
    want = patch(want, "v_amt numeric;\nBEGIN", "v_amt numeric; v_goods jsonb;\nBEGIN");
    want = patch(
      want,
      "  UPDATE yuplink.castle_architect SET level",
      `${TAKE}  UPDATE yuplink.castle_architect SET level`,
    );
    want = patch(
      want,
      `    VALUES (p_op, p_account, 'upgrade', jsonb_build_object('from', v_level, 'cost', p_cost));`,
      `    VALUES (p_op, p_account, 'upgrade',
            jsonb_build_object('from', v_level, 'cost', p_cost)${DETAIL_GOODS}`,
    );
    expect(fn(m40, "castle_architect_upgrade")).toBe(want);
  });

  it("возврат — прежняя функция плюс товары тому же герою по снимку", () => {
    let want = fn(m10, "castle_architect_refund");
    want = patch(want, "v_amt numeric;\nBEGIN", "v_amt numeric; v_owner text;\nBEGIN");
    want = patch(
      want,
      "  UPDATE yuplink.castle_architect_op SET refunded_at",
      `  IF jsonb_typeof(v_op.detail->'goods') = 'array' THEN
    -- Тому герою, с кого сняли; ячейка — на его счёт.
    SELECT h.account_id INTO v_owner FROM yuplink.hero_instance h WHERE h.id = v_op.detail->>'hero';
    PERFORM yuplink.castle_architect_return_goods(
      v_op.detail->>'hero', COALESCE(v_owner, v_acc), v_op.detail->'goods', p_op);
  END IF;
  UPDATE yuplink.castle_architect_op SET refunded_at`,
    );
    expect(fn(m40, "castle_architect_refund")).toBe(want);
  });

  it("старые сигнатуры удаляются до новых; транзакция и лок", () => {
    const at = (s: string) => m40.indexOf(s);
    for (const [drop, create] of [
      ["castle_architect_upgrade(text, integer, jsonb, text);", "castle_architect_upgrade(\n"],
      ["castle_architect_pay(text, text, jsonb, text);", "castle_architect_pay(\n"],
    ]) {
      expect(at(`DROP FUNCTION IF EXISTS yuplink.${drop}`)).toBeGreaterThan(0);
      expect(at(`DROP FUNCTION IF EXISTS yuplink.${drop}`)).toBeLessThan(
        at(`CREATE OR REPLACE FUNCTION yuplink.${create}`),
      );
    }
    expect(m40).toMatch(/^BEGIN;\nSET LOCAL lock_timeout = '5s';$/m);
    expect(m40.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("списание и возврат меток — те же формулы, что stack-origin (беречь мобов)", () => {
    const take = fn(m40, "castle_architect_take_goods");
    expect(take).toContain("FOR UPDATE");
    expect(take).toContain("RAISE EXCEPTION 'architect_no_goods:% ×%'");
    expect(take).toContain("n0 := LEAST(p0, v_left); n1 := LEAST(p1, v_left)");
    expect(take).toContain("'mob', GREATEST(0, w0 - n0)");
    const back = fn(m40, "castle_architect_return_goods");
    expect(back).toContain("ON CONFLICT (hero_id, stack_key) DO UPDATE");
    expect(back).toContain(
      "mob_count = LEAST(LEAST(b.mob_count, b.count) + EXCLUDED.mob_count, b.count + EXCLUDED.count)",
    );
  });
});
