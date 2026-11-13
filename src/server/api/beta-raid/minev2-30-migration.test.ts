// Миграция minev2-30 (шахты острова, ПРАВИЛА §8.59 п. 11): тела settle,
// close, pending, repair и set_mode — копии minev2-01/03 ровно с правками острова
// (ничего больше не поменялось), островные отказы стоят после проверки повтора,
// у мира период 1, 3-аргументная v2_hours не тронута.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../../migrations/${name}`, import.meta.url)), "utf8");

const m30 = read("minev2-30-island.sql");
const m01 = read("minev2-01-engine.sql");
const m03 = read("minev2-03-engine-repair.sql");

/** Текст функции: от заголовка до первого конца тела. */
function fn(src: string, head: string, end: string): string {
  const i = src.indexOf(head);
  if (i < 0) throw new Error(`нет функции: ${head}`);
  const j = src.indexOf(end, i);
  if (j < 0) throw new Error(`нет конца функции: ${head}`);
  return src.slice(i, j + end.length);
}

/** Одна замена; кусок обязан встречаться ровно раз. */
function patch(text: string, from: string, to: string): string {
  expect(text.split(from).length - 1, from).toBe(1);
  return text.replace(from, to);
}

const REPLACE = "CREATE OR REPLACE FUNCTION";
const ISLAND_REPAIR = `  -- Остров (§8.59 п. 11): только «База»; клетку чинят один раз навсегда —
  -- работает она или выработана, второй починки нет. Повтор того же op уже
  -- ответил выше прежним ответом.
  IF yuplink.raid_mine_is_island(cfg) THEN
    IF p_mode <> 'base' THEN RAISE EXCEPTION 'mine_island_mode'; END IF;
    IF EXISTS (SELECT 1 FROM yuplink.raid_mine_op o
                WHERE o.kind = 'repair' AND o.map_id = p_map AND o.q = p_q AND o.r = p_r) THEN
      RAISE EXCEPTION 'mine_spent';
    END IF;
  END IF;
`;

describe("миграция minev2-30: оформление", () => {
  it("шапка, BEGIN/COMMIT, lock_timeout, порядок накатки и сверка с продом", () => {
    expect(m30.trimStart().startsWith("--")).toBe(true);
    expect(m30).toContain("BEGIN;\nSET LOCAL lock_timeout = '5s';");
    expect(m30.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(m30).toContain("minev2-01..03");
    expect(m30).toContain("pg_get_functiondef");
    // Ничего не удаляем: 3-аргументная v2_hours и прочие функции остаются.
    expect(m30).not.toMatch(/DROP FUNCTION/i);
  });

  it("флаг острова, период и 4-аргументная v2_hours — без DEFAULT", () => {
    expect(m30).toContain("SELECT COALESCE(p_cfg->>'island' = 'true', false)");
    expect(m30).toMatch(
      /raid_mine_v2_period\(p_cfg jsonb\)[\s\S]*?raid_mine_is_island\(p_cfg\) AND p_cfg->>'resource' = 'diamonds'\s+THEN 24 ELSE 1 END/,
    );
    const hours = fn(m30, `${REPLACE} yuplink.raid_mine_v2_hours(`, "$fn$;");
    expect(hours).toContain("p_claimed numeric, p_period numeric)");
    expect(hours).not.toMatch(/DEFAULT/i);
    expect(hours).toContain("GREATEST(COALESCE(p_period, 1), 1)");
    expect(m30).toMatch(
      /CREATE INDEX IF NOT EXISTS raid_mine_op_cell\s+ON yuplink\.raid_mine_op \(map_id, q, r\) WHERE kind = 'repair';/,
    );
  });

  it("функции идут после тех, кого зовут (тела sql проверяются при создании)", () => {
    const at = (s: string) => m30.indexOf(s);
    expect(at("FUNCTION yuplink.raid_mine_is_island")).toBeLessThan(
      at("FUNCTION yuplink.raid_mine_v2_std"),
    );
    expect(at("FUNCTION yuplink.raid_mine_v2_period")).toBeLessThan(
      at("FUNCTION yuplink.raid_mine_v2_settle"),
    );
  });
});

describe("миграция minev2-30: тела — копии 01/03 с правками острова", () => {
  it("v2_std: островная ветка после maxHours, мир прежний", () => {
    const head = `${REPLACE} yuplink.raid_mine_v2_std(`;
    const want = patch(
      fn(m01, head, "$fn$;"),
      "    ELSE CASE p_cfg->>'resource'",
      `    -- Остров: дерево/камень/золото 1, алмаз 1/24 в час (платится целыми сутками).
    WHEN yuplink.raid_mine_is_island(p_cfg) THEN CASE p_cfg->>'resource'
           WHEN 'wood' THEN 1 WHEN 'stone' THEN 1 WHEN 'gold' THEN 1
           WHEN 'diamonds' THEN 1::numeric / 24
         END
    ELSE CASE p_cfg->>'resource'`,
    );
    expect(fn(m30, head, "$fn$;")).toBe(want);
  });

  it("settle: часы — целыми периодами клетки", () => {
    const head = `${REPLACE} yuplink.raid_mine_v2_settle(`;
    const want = patch(
      fn(m01, head, "END $fn$;"),
      "p_st.life_at), p_st.claimed_hours);",
      "p_st.life_at), p_st.claimed_hours,\n           yuplink.raid_mine_v2_period(p_cfg));",
    );
    expect(fn(m30, head, "END $fn$;")).toBe(want);
  });

  it("close: у алмаза острова (период больше часа) — без дробного хвоста", () => {
    const head = `${REPLACE} yuplink.raid_mine_v2_close(`;
    const want = patch(
      fn(m01, head, "END $fn$;"),
      "  SELECT * INTO s FROM yuplink.raid_mine_v2_settle(p_st, p_cfg, '');\n",
      "  SELECT * INTO s FROM yuplink.raid_mine_v2_settle(p_st, p_cfg, '');\n" +
        "  -- Остров (§8.59 п. 11): алмаз платится только целыми сутками — без дробного хвоста.\n" +
        "  IF yuplink.raid_mine_v2_period(p_cfg) > 1 THEN amount := s.amount; RETURN; END IF;\n",
    );
    expect(fn(m30, head, "END $fn$;")).toBe(want);
  });

  it("pending: v2-ветка — периодами и до 4 знаков, старая ветка слово в слово", () => {
    const head = `${REPLACE} yuplink.raid_mine_pending(`;
    let want = fn(m01, head, "END; $function$;");
    want = patch(
      want,
      "RETURN yuplink.raid_mine_v2_hours(",
      "RETURN round(yuplink.raid_mine_v2_hours(",
    );
    want = patch(
      want,
      "st.life_at), st.claimed_hours)\n           * v_std * yuplink.raid_mine_mode_mult(st.mode);",
      "st.life_at), st.claimed_hours,\n             yuplink.raid_mine_v2_period(cfg))\n" +
        "           * v_std * yuplink.raid_mine_mode_mult(st.mode), 4);",
    );
    expect(fn(m30, head, "END; $function$;")).toBe(want);
  });

  it("repair: островной блок — после повтора op и проверки цены, до поломки", () => {
    let want = fn(m03, "CREATE FUNCTION yuplink.raid_mine_repair(", "END $fn$;");
    want = patch(want, "CREATE FUNCTION", REPLACE);
    want = patch(want, "  -- Пора ломаться", `${ISLAND_REPAIR}  -- Пора ломаться`);
    const got = fn(m30, `${REPLACE} yuplink.raid_mine_repair(`, "END $fn$;");
    expect(got).toBe(want);
    // Ретрай моста после коммита: тот же op отвечает раньше отказа mine_spent.
    expect(got.indexOf("WHERE o.op = p_op")).toBeLessThan(got.indexOf("'mine_spent'"));
    expect(got.indexOf("'mine_spent'")).toBeLessThan(got.indexOf("raid_mine_break("));
  });

  it("set_mode: на острове только «База»", () => {
    let want = fn(m03, "CREATE FUNCTION yuplink.raid_mine_set_mode(", "END $fn$;");
    want = patch(want, "CREATE FUNCTION", REPLACE);
    want = patch(
      want,
      "RAISE EXCEPTION 'mine_not_v2'; END IF;\n  SELECT * INTO st",
      "RAISE EXCEPTION 'mine_not_v2'; END IF;\n" +
        "  -- Остров (§8.59 п. 11): только «База» (её же — штатный no-op ниже).\n" +
        "  IF yuplink.raid_mine_is_island(cfg) AND p_mode <> 'base' THEN RAISE EXCEPTION 'mine_island_mode'; END IF;\n" +
        "  SELECT * INTO st",
    );
    expect(fn(m30, `${REPLACE} yuplink.raid_mine_set_mode(`, "END $fn$;")).toBe(want);
  });
});
